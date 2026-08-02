import 'server-only';

import { ApiProblem } from '@/lib/server/api';
import { getAuth } from '@/lib/server/auth';
import { getAppContext } from '@/lib/server/env';

export type Principal = {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  sessionId: string;
  sessionCreatedAt: Date;
};

export async function requirePrincipal(request: Request): Promise<Principal> {
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result) throw new ApiProblem(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');

  const session = result.session as typeof result.session & { absoluteExpiresAt?: Date | string | number };
  const absoluteExpiresAt = new Date(session.absoluteExpiresAt ?? 0);
  if (!Number.isFinite(absoluteExpiresAt.getTime()) || absoluteExpiresAt.getTime() <= Date.now()) {
    const { env } = await getAppContext();
    await env.DB.prepare('DELETE FROM session WHERE id = ?1').bind(session.id).run();
    throw new ApiProblem(401, 'SESSION_EXPIRED', 'Your session has expired. Sign in again.');
  }

  return {
    userId: result.user.id,
    email: result.user.email.toLowerCase(),
    name: result.user.name,
    emailVerified: result.user.emailVerified,
    sessionId: session.id,
    sessionCreatedAt: new Date(session.createdAt),
  };
}

export function requireFreshPrincipal(principal: Principal): void {
  const freshForMs = 15 * 60 * 1000;
  if (Date.now() - principal.sessionCreatedAt.getTime() >= freshForMs) {
    throw new ApiProblem(401, 'FRESH_AUTH_REQUIRED', 'Sign in again before this sensitive action.');
  }
}
