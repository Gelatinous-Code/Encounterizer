import { apiRoute } from '@/lib/server/api';
import { requireFreshPrincipal, requirePrincipal } from '@/lib/server/session';

type ExportUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: number;
  createdAt: number;
  updatedAt: number;
};

type ExportMembership = {
  campaignId: string;
  campaignName: string;
  role: string;
  membershipCreatedAt: number;
  campaignCreatedAt: number;
};

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, '/api/v1/account/export', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    requireFreshPrincipal(principal);
    const user = await env.DB.prepare(
      `SELECT id, name, email, emailVerified, createdAt, updatedAt
         FROM user
        WHERE id = ?1`,
    ).bind(principal.userId).first<ExportUser>();
    const memberships = await env.DB.prepare(
      `SELECT c.id AS campaignId,
              c.name AS campaignName,
              cm.role,
              cm.createdAt AS membershipCreatedAt,
              c.createdAt AS campaignCreatedAt
         FROM campaignMembership cm
         JOIN campaign c ON c.id = cm.campaignId
        WHERE cm.userId = ?1
          AND c.deletedAt IS NULL
        ORDER BY c.createdAt, c.id`,
    ).bind(principal.userId).all<ExportMembership>();

    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('UPDATE user SET lastExportedAt = ?1, updatedAt = ?1 WHERE id = ?2')
        .bind(now, principal.userId),
      env.DB.prepare(
        `INSERT INTO accountLifecycleEvent
           (id, userId, eventType, occurredAt, requestId)
         VALUES (?1, ?2, 'exported', ?3, ?4)`,
      ).bind(crypto.randomUUID(), principal.userId, now, requestId),
    ]);

    const stamp = new Date(now).toISOString().slice(0, 10);
    return Response.json({
      schemaVersion: 1,
      exportedAt: new Date(now).toISOString(),
      account: user ? { ...user, emailVerified: user.emailVerified === 1 } : null,
      memberships: memberships.results,
    }, {
      headers: {
        'content-disposition': `attachment; filename="encounterizer-account-${stamp}.json"`,
      },
    });
  });
}
