import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/api';
import { CAMPAIGN_ROLES } from '@/lib/server/authorization';
import { changeMemberRole, removeCampaignMember } from '@/lib/server/campaign-service';
import { requireFreshPrincipal, requirePrincipal } from '@/lib/server/session';

const idSchema = z.string().uuid();
const userIdSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
const roleSchema = z.object({ role: z.enum(CAMPAIGN_ROLES) }).strict();
type RouteContext = { params: Promise<{ campaignId: string; userId: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId/members/:userId', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    requireFreshPrincipal(principal);
    const params = await context.params;
    const input = roleSchema.parse(await request.json());
    await changeMemberRole({
      db: env.DB,
      actorUserId: principal.userId,
      campaignId: idSchema.parse(params.campaignId),
      targetUserId: userIdSchema.parse(params.userId),
      nextRole: input.role,
      requestId,
    });
    return jsonResponse({ ok: true });
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId/members/:userId', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    requireFreshPrincipal(principal);
    const params = await context.params;
    await removeCampaignMember({
      db: env.DB,
      actorUserId: principal.userId,
      campaignId: idSchema.parse(params.campaignId),
      targetUserId: userIdSchema.parse(params.userId),
      requestId,
    });
    return new Response(null, { status: 204 });
  });
}
