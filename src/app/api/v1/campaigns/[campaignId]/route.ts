import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/api';
import { authorizeCampaign } from '@/lib/server/authorization';
import { deleteCampaign, updateCampaign } from '@/lib/server/campaign-service';
import { requireFreshPrincipal, requirePrincipal } from '@/lib/server/session';

const idSchema = z.string().uuid();
const updateSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();

type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId', async ({ env }) => {
    const principal = await requirePrincipal(request);
    const campaignId = idSchema.parse((await context.params).campaignId);
    const access = await authorizeCampaign(env.DB, principal.userId, campaignId, 'campaign.read');
    return jsonResponse({
      campaign: {
        id: access.campaignId,
        name: access.campaignName,
        primaryOwnerUserId: access.primaryOwnerUserId,
        role: access.role,
      },
    });
  });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    const campaignId = idSchema.parse((await context.params).campaignId);
    const input = updateSchema.parse(await request.json());
    await updateCampaign({
      db: env.DB,
      actorUserId: principal.userId,
      campaignId,
      name: input.name,
      requestId,
    });
    return jsonResponse({ ok: true });
  });
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    requireFreshPrincipal(principal);
    const campaignId = idSchema.parse((await context.params).campaignId);
    await deleteCampaign({
      db: env.DB,
      actorUserId: principal.userId,
      campaignId,
      requestId,
    });
    return new Response(null, { status: 204 });
  });
}
