import 'server-only';

import { ZodError } from 'zod';
import { logRequest, problemResponse, requestIdFor } from '@/lib/server/http';
import { enforceSameOrigin } from '@/lib/server/csrf';
import { getAppContext } from '@/lib/server/env';
import { ApiProblem } from '@/lib/server/problem';

export { ApiProblem } from '@/lib/server/problem';

export type ApiRouteContext = {
  requestId: string;
  env: Awaited<ReturnType<typeof getAppContext>>['env'];
  execution: Awaited<ReturnType<typeof getAppContext>>['ctx'];
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiRoute(
  request: Request,
  route: string,
  handler: (context: ApiRouteContext) => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = requestIdFor(request);
  const { env, ctx } = await getAppContext();
  let response: Response;

  try {
    if (MUTATING_METHODS.has(request.method)) enforceSameOrigin(request, env);
    response = await handler({ requestId, env, execution: ctx });
  } catch (error) {
    if (error instanceof ApiProblem) {
      response = problemResponse({
        requestId,
        instance: new URL(request.url).pathname,
        status: error.status,
        code: error.code,
        title: titleFor(error.status),
        detail: error.message,
        headers: error.headers,
        extensions: error.extensions,
      });
    } else if (error instanceof ZodError) {
      response = problemResponse({
        requestId,
        instance: new URL(request.url).pathname,
        status: 400,
        code: 'VALIDATION_FAILED',
        title: 'Invalid request',
        detail: 'The request did not match the expected shape.',
        extensions: {
          errors: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    } else {
      console.error({
        event: 'http.unhandled_error',
        requestId,
        route,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      response = problemResponse({
        requestId,
        instance: new URL(request.url).pathname,
        status: 500,
        code: 'INTERNAL_ERROR',
        title: 'Internal server error',
        detail: 'The request could not be completed.',
      });
    }
  }

  response.headers.set('x-request-id', requestId);
  response.headers.set('cache-control', 'no-store');
  logRequest({
    request,
    requestId,
    route,
    status: response.status,
    environment: env.APP_ENV ?? 'unknown',
    startedAt,
  });
  return response;
}

export function jsonResponse(
  value: unknown,
  options: { status?: number; headers?: HeadersInit } = {},
): Response {
  return Response.json(value, {
    status: options.status ?? 200,
    headers: options.headers,
  });
}

function titleFor(status: number): string {
  if (status === 400) return 'Invalid request';
  if (status === 401) return 'Authentication required';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not found';
  if (status === 409) return 'Conflict';
  if (status === 429) return 'Too many requests';
  return 'Request failed';
}
