import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/api';
import { createCampaign, listCampaigns } from '@/lib/server/campaign-service';
import { requirePrincipal } from '@/lib/server/session';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
}).strict();

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns', async ({ env }) => {
    const principal = await requirePrincipal(request);
    return jsonResponse({ campaigns: await listCampaigns(env.DB, principal.userId) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    const input = createSchema.parse(await request.json());
    const campaign = await createCampaign({
      db: env.DB,
      userId: principal.userId,
      name: input.name,
      requestId,
    });
    return jsonResponse({ campaign }, {
      status: 201,
      headers: { location: `/api/v1/campaigns/${campaign.id}` },
    });
  });
}
