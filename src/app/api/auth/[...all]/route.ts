import { ApiProblem } from '@/lib/server/api';
import { getAuth } from '@/lib/server/auth';
import { enforceSameOrigin } from '@/lib/server/csrf';
import { getAppContext } from '@/lib/server/env';
import { requireTurnstile } from '@/lib/server/turnstile';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return (await getAuth()).handler(request);
}

export async function POST(request: Request): Promise<Response> {
  const { env } = await getAppContext();
  enforceSameOrigin(request, env);

  const pathname = new URL(request.url).pathname;
  try {
    if (pathname.endsWith('/sign-up/email')) {
      await requireTurnstile({ request, env, action: 'signup' });
    } else if (pathname.endsWith('/request-password-reset')) {
      await requireTurnstile({ request, env, action: 'password-reset' });
    }
  } catch (error) {
    if (error instanceof ApiProblem) {
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.status, headers: { 'cache-control': 'no-store' } },
      );
    }
    throw error;
  }

  return (await getAuth()).handler(request);
}
