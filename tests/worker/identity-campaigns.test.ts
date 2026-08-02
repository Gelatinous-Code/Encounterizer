import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const testEnv = env as unknown as { APP: Fetcher; DB: D1Database };
const app = testEnv.APP;
const origin = 'https://encounterizer.test';
const password = 'correct horse battery staple';

type TestUser = { email: string; cookie: string; id: string };

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return app.fetch(new Request(`${origin}${path}`, init));
}

async function mutation(
  path: string,
  method: string,
  body: unknown,
  cookie?: string,
  extraHeaders: HeadersInit = {},
): Promise<Response> {
  return request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      origin,
      'sec-fetch-site': 'same-origin',
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookieFrom(response: Response): string {
  const values = response.headers.getSetCookie();
  const value = values.find((candidate) => candidate.includes('session_token='));
  if (!value) throw new Error(`Expected a session cookie, received ${values.length} Set-Cookie values`);
  return value.split(';', 1)[0];
}

async function createUser(name: string, email: string): Promise<TestUser> {
  const signup = await mutation('/api/auth/sign-up/email', 'POST', {
    name,
    email,
    password,
  }, undefined, { 'x-turnstile-token': 'XXXX.DUMMY.TOKEN.XXXX' });
  expect(signup.status).toBe(200);

  const signIn = await mutation('/api/auth/sign-in/email', 'POST', {
    email,
    password,
    callbackURL: '/campaigns',
    rememberMe: true,
  });
  expect(signIn.status).toBe(200);
  const cookie = cookieFrom(signIn);
  const user = await testEnv.DB.prepare('SELECT id FROM user WHERE email = ?1')
    .bind(email)
    .first<{ id: string }>();
  if (!user) throw new Error('Expected created user');
  return { email, cookie, id: user.id };
}

describe.sequential('CF-2 identity, tenancy, and authorization', () => {
  let owner: TestUser;
  let outsider: TestUser;
  let campaignId: string;

  beforeAll(async () => {
    owner = await createUser('Owner', 'owner@example.com');
    outsider = await createUser('Outsider', 'outsider@example.com');
    const created = await mutation('/api/v1/campaigns', 'POST', { name: 'The Bronze March' }, owner.cookie);
    expect(created.status).toBe(201);
    campaignId = (await created.json<{ campaign: { id: string } }>()).campaign.id;
  });

  it('rejects signup without a Turnstile token', async () => {
    const response = await mutation('/api/auth/sign-up/email', 'POST', {
      name: 'Bot',
      email: 'bot@example.com',
      password,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'BOT_VERIFICATION_FAILED' });
  });

  it('rejects cross-site mutation requests before application logic', async () => {
    const response = await request('/api/v1/campaigns', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
        cookie: owner.cookie,
      },
      body: JSON.stringify({ name: 'Stolen' }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CSRF_REJECTED' });
  });

  it.each([
    ['enumerate', 'GET', undefined],
    ['mutate', 'PATCH', { name: 'Hijacked' }],
    ['delete', 'DELETE', undefined],
  ])('returns a private 404 when another user tries to %s a campaign', async (_label, method, body) => {
    const response = method === 'GET'
      ? await request(`/api/v1/campaigns/${campaignId}`, {
          headers: { cookie: outsider.cookie },
        })
      : await mutation(`/api/v1/campaigns/${campaignId}`, method, body, outsider.cookie);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });

  it('does not allow an owner to remove or demote the final owner', async () => {
    const demote = await mutation(
      `/api/v1/campaigns/${campaignId}/members/${owner.id}`,
      'PATCH',
      { role: 'dm' },
      owner.cookie,
    );
    expect(demote.status).toBe(409);
    await expect(demote.json()).resolves.toMatchObject({ code: 'FINAL_OWNER_REQUIRED' });

    const remove = await mutation(
      `/api/v1/campaigns/${campaignId}/members/${owner.id}`,
      'DELETE',
      undefined,
      owner.cookie,
    );
    expect(remove.status).toBe(409);
  });

  it('keeps an owner when concurrent mutations race below the service layer', async () => {
    const created = await mutation('/api/v1/campaigns', 'POST', { name: 'Invariant test' }, owner.cookie);
    const isolatedCampaignId = (await created.json<{ campaign: { id: string } }>()).campaign.id;
    const now = Date.now();
    await testEnv.DB.prepare(
      `INSERT INTO campaignMembership
         (id, campaignId, userId, role, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, 'owner', ?4, ?4)`,
    ).bind(crypto.randomUUID(), isolatedCampaignId, outsider.id, now).run();

    const results = await Promise.allSettled([
      testEnv.DB.prepare(
        `UPDATE campaignMembership SET role = 'dm', updatedAt = ?1
          WHERE campaignId = ?2 AND userId = ?3`,
      ).bind(now + 1, isolatedCampaignId, owner.id).run(),
      testEnv.DB.prepare(
        `UPDATE campaignMembership SET role = 'dm', updatedAt = ?1
          WHERE campaignId = ?2 AND userId = ?3`,
      ).bind(now + 1, isolatedCampaignId, outsider.id).run(),
    ]);

    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const ownerCount = await testEnv.DB.prepare(
      `SELECT count(*) AS count FROM campaignMembership
        WHERE campaignId = ?1 AND role = 'owner'`,
    ).bind(isolatedCampaignId).first<{ count: number }>();
    expect(ownerCount?.count).toBe(1);
  });

  it('supports hashed, email-bound, idempotent invitation acceptance', async () => {
    await testEnv.DB.prepare('UPDATE user SET emailVerified = 1 WHERE id = ?1')
      .bind(outsider.id)
      .run();
    const invited = await mutation(
      `/api/v1/campaigns/${campaignId}/invitations`,
      'POST',
      { email: outsider.email, role: 'dm' },
      owner.cookie,
    );
    expect(invited.status).toBe(201);
    const invitationBody = await invited.json<{
      invitation: { acceptanceUrl: string };
    }>();
    const token = invitationBody.invitation.acceptanceUrl.split('/').at(-1);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = await testEnv.DB.prepare(
      'SELECT tokenHash FROM campaignInvitation WHERE campaignId = ?1 AND email = ?2',
    ).bind(campaignId, outsider.email).first<{ tokenHash: string }>();
    expect(stored?.tokenHash).not.toBe(token);
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    const accept = () => mutation(
      `/api/v1/invitations/${token}/accept`,
      'POST',
      {},
      outsider.cookie,
      { 'x-turnstile-token': 'XXXX.DUMMY.TOKEN.XXXX' },
    );
    expect((await accept()).status).toBe(200);
    expect((await accept()).status).toBe(200);

    const membership = await testEnv.DB.prepare(
      'SELECT role FROM campaignMembership WHERE campaignId = ?1 AND userId = ?2',
    ).bind(campaignId, outsider.id).first<{ role: string }>();
    expect(membership?.role).toBe('dm');
  });

  it('applies the documented DM member-management boundary', async () => {
    const player = await createUser('Player', 'player@example.com');
    const ownerInvite = await mutation(
      `/api/v1/campaigns/${campaignId}/invitations`,
      'POST',
      { email: player.email, role: 'player' },
      outsider.cookie,
    );
    expect(ownerInvite.status).toBe(201);

    const forbiddenDmInvite = await mutation(
      `/api/v1/campaigns/${campaignId}/invitations`,
      'POST',
      { email: 'another-dm@example.com', role: 'dm' },
      outsider.cookie,
    );
    expect(forbiddenDmInvite.status).toBe(403);
    await expect(forbiddenDmInvite.json()).resolves.toMatchObject({ code: 'CAPABILITY_REQUIRED' });
  });

  it('blocks account deletion while the user owns an active campaign', async () => {
    const response = await mutation('/api/v1/account', 'DELETE', {}, owner.cookie);
    expect(response.status).toBe(409);
    const body = await response.json<{ code: string; campaigns: Array<{ id: string }> }>();
    expect(body.code).toBe('OWNERSHIP_TRANSFER_REQUIRED');
    expect(body.campaigns).toContainEqual(expect.objectContaining({ id: campaignId }));
  });

  it('issues a new opaque session token for a new login', async () => {
    const response = await mutation('/api/auth/sign-in/email', 'POST', {
      email: owner.email,
      password,
      callbackURL: '/campaigns',
    });
    expect(response.status).toBe(200);
    expect(cookieFrom(response)).not.toBe(owner.cookie);
  });

  it('rejects an untrusted absolute return URL', async () => {
    const response = await mutation('/api/auth/sign-in/email', 'POST', {
      email: owner.email,
      password,
      callbackURL: 'https://evil.example/steal',
    });
    expect(response.status).toBe(403);
  });
});
