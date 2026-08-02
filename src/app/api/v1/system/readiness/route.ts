import { logRequest, problemResponse, requestIdFor } from '@/lib/server/http';
import { evaluateReadiness, readRuntimeIdentity } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = requestIdFor(request);
  const runtime = await readRuntimeIdentity();
  const readiness = evaluateReadiness(runtime);

  const response = readiness.ready
    ? Response.json(
        {
          status: 'ready',
          environment: runtime.environment,
          version: runtime.versionId,
          checks: readiness.checks,
          requestId,
          checkedAt: new Date().toISOString(),
        },
        {
          headers: {
            'cache-control': 'no-store',
            'x-request-id': requestId,
          },
        },
      )
    : problemResponse({
        requestId,
        instance: new URL(request.url).pathname,
        status: 503,
        code: 'SERVICE_NOT_READY',
        title: 'Service is not ready',
        detail: 'One or more required runtime capabilities are unavailable.',
        headers: { 'retry-after': '5' },
        extensions: { checks: readiness.checks },
      });

  logRequest({
    request,
    requestId,
    route: '/api/v1/system/readiness',
    status: response.status,
    environment: runtime.environment,
    startedAt,
  });

  return response;
}
