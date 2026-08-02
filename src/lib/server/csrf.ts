import 'server-only';

import { ApiProblem } from '@/lib/server/problem';
import { type AppEnv, csvValues } from '@/lib/server/env';

export function enforceSameOrigin(request: Request, env: AppEnv): void {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const trustedOrigins = new Set(csvValues(env.AUTH_TRUSTED_ORIGINS));

  if (!origin || !trustedOrigins.has(origin)) {
    throw new ApiProblem(403, 'CSRF_REJECTED', 'The request origin is not trusted.');
  }

  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site') {
    throw new ApiProblem(403, 'CSRF_REJECTED', 'Cross-site mutation requests are not accepted.');
  }
}
