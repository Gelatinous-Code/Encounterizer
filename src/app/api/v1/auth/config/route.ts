import { apiRoute, jsonResponse } from '@/lib/server/api';

export async function GET(request: Request): Promise<Response> {
  return apiRoute(request, '/api/v1/auth/config', async ({ env }) => jsonResponse({
    emailPasswordEnabled: env.AUTH_EMAIL_ENABLED === 'true' || env.APP_ENV === 'local',
    emailVerificationRequired: env.AUTH_EMAIL_ENABLED === 'true',
    googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null,
  }));
}
