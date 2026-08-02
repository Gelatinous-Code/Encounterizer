import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/api';
import { acceptCampaignInvitation } from '@/lib/server/campaign-service';
import { requirePrincipal } from '@/lib/server/session';
import { requireTurnstile } from '@/lib/server/turnstile';

const tokenSchema = z.string().min(40).max(128).regex(/^[A-Za-z0-9_-]+$/);
type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/invitations/:token/accept', async ({ env, requestId }) => {
    const principal = await requirePrincipal(request);
    await requireTurnstile({ request, env, action: 'invitation-accept' });
    const result = await acceptCampaignInvitation({
      db: env.DB,
      userId: principal.userId,
      email: principal.email,
      emailVerified: principal.emailVerified,
      token: tokenSchema.parse((await context.params).token),
      requestId,
    });
    return jsonResponse(result);
  });
}
