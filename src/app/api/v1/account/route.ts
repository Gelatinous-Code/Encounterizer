import { z } from 'zod';
import { ApiProblem, apiRoute } from '@/lib/server/api';
import { getAuth } from '@/lib/server/auth';
import { requireFreshPrincipal, requirePrincipal } from '@/lib/server/session';

const deleteSchema = z.object({
  password: z.string().min(1).max(128).optional(),
}).strict();

export async function DELETE(request: Request): Promise<Response> {
  return apiRoute(request, '/api/v1/account', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    requireFreshPrincipal(principal);
    const owned = await env.DB.prepare(
      `SELECT c.id, c.name
         FROM campaignMembership cm
         JOIN campaign c ON c.id = cm.campaignId
        WHERE cm.userId = ?1
          AND cm.role = 'owner'
          AND c.deletedAt IS NULL
        ORDER BY c.createdAt, c.id`,
    ).bind(principal.userId).all<{ id: string; name: string }>();
    if (owned.results.length > 0) {
      throw new ApiProblem(
        409,
        'OWNERSHIP_TRANSFER_REQUIRED',
        'Transfer or delete owned campaigns before deleting this account.',
        undefined,
        { campaigns: owned.results },
      );
    }

    const input = deleteSchema.parse(await request.json());
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-request-id', requestId);
    const authRequest = new Request(new URL('/api/auth/delete-user', request.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...(input.password ? { password: input.password } : {}),
        callbackURL: '/',
      }),
    });
    return (await getAuth()).handler(authRequest);
  });
}
