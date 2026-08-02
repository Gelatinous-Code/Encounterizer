import 'server-only';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

type ProblemResponseOptions = {
  requestId: string;
  instance: string;
  status: number;
  code: string;
  title: string;
  detail: string;
  type?: string;
  headers?: HeadersInit;
  extensions?: Record<string, unknown>;
};

export function requestIdFor(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

export function problemResponse({
  requestId,
  instance,
  status,
  code,
  title,
  detail,
  type = `https://encounterizer.com/problems/${code.toLowerCase().replaceAll('_', '-')}`,
  headers,
  extensions,
}: ProblemResponseOptions): Response {
  return Response.json(
    {
      ...extensions,
      type,
      title,
      status,
      detail,
      instance,
      code,
      requestId,
    },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/problem+json',
        'x-request-id': requestId,
        ...headers,
      },
    },
  );
}

export function logRequest(options: {
  request: Request;
  requestId: string;
  route: string;
  status: number;
  environment: string;
  startedAt: number;
}): void {
  console.info({
    event: 'http.request',
    method: options.request.method,
    route: options.route,
    status: options.status,
    durationMs: Date.now() - options.startedAt,
    environment: options.environment,
    requestId: options.requestId,
  });
}
