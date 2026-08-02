import { z } from 'zod';
import { apiRoute, jsonResponse } from '@/lib/server/api';
import { createCampaignInvitation } from '@/lib/server/campaign-service';
import { scheduleTransactionalEmail } from '@/lib/server/email';
import { requirePrincipal } from '@/lib/server/session';

const idSchema = z.string().uuid();
const invitationSchema = z.object({
  email: z.email().max(320),
  role: z.enum(['dm', 'player']),
}).strict();
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(request, '/api/v1/campaigns/:campaignId/invitations', async ({
    env,
    execution,
    requestId,
  }) => {
    const principal = await requirePrincipal(request);
    const campaignId = idSchema.parse((await context.params).campaignId);
    const input = invitationSchema.parse(await request.json());
    const invitation = await createCampaignInvitation({
      db: env.DB,
      actorUserId: principal.userId,
      campaignId,
      email: input.email,
      role: input.role,
      requestId,
    });
    const acceptanceUrl = `${env.AUTH_ORIGIN}/invitations/${encodeURIComponent(invitation.token)}`;
    scheduleTransactionalEmail({ env, ctx: execution }, {
      to: input.email,
      subject: 'You are invited to an Encounterizer campaign',
      heading: 'Join the campaign',
      message: `You were invited as a ${input.role === 'dm' ? 'DM' : 'player'}. This invitation expires in 7 days.`,
      actionLabel: 'Accept invitation',
      actionUrl: acceptanceUrl,
    });
    return jsonResponse({
      invitation: {
        id: invitation.id,
        expiresAt: invitation.expiresAt,
        ...(env.APP_ENV === 'local' ? { acceptanceUrl } : {}),
      },
    }, { status: 201 });
  });
}
