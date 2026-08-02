import { logRequest, requestIdFor } from '@/lib/server/http';
import { readRuntimeIdentity } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = requestIdFor(request);
  const runtime = await readRuntimeIdentity();

  const response = Response.json(
    {
      status: 'ok',
      environment: runtime.environment,
      version: runtime.versionId,
      requestId,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId,
      },
    },
  );

  logRequest({
    request,
    requestId,
    route: '/api/v1/system/health',
    status: response.status,
    environment: runtime.environment,
    startedAt,
  });

  return response;
}
