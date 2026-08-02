import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/api';
import { transferPrimaryOwnership } from '@/lib/server/campaign-service';
import { requireFreshPrincipal, requirePrincipal } from '@/lib/server/session';

const idSchema = z.string().uuid();
const transferSchema = z.object({
  targetUserId: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId/ownership', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    requireFreshPrincipal(principal);
    const input = transferSchema.parse(await request.json());
    await transferPrimaryOwnership({
      db: env.DB,
      actorUserId: principal.userId,
      campaignId: idSchema.parse((await context.params).campaignId),
      targetUserId: input.targetUserId,
      requestId,
    });
    return jsonResponse({ ok: true });
  });
}
