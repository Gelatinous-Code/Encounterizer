import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/api';
import { listCampaignMembers } from '@/lib/server/campaign-service';
import { requirePrincipal } from '@/lib/server/session';

const idSchema = z.string().uuid();
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId/members', async ({ env }) => {
    const principal = await requirePrincipal(request);
    const campaignId = idSchema.parse((await context.params).campaignId);
    const members = await listCampaignMembers({
      db: env.DB,
      actorUserId: principal.userId,
      campaignId,
    });
    return jsonResponse({ members });
  });
}
