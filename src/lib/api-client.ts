export type ProblemDetails = {
  title?: string;
  detail?: string;
  code?: string;
  campaigns?: Array<{ id: string; name: string }>;
};

export async function apiError(response: Response, fallback: string): Promise<Error & { problem?: ProblemDetails }> {
  let problem: ProblemDetails | undefined;
  try {
    problem = await response.json() as ProblemDetails;
  } catch {
    // A proxy or platform failure may not return JSON.
  }
  const error = new Error(problem?.detail ?? problem?.title ?? fallback) as Error & { problem?: ProblemDetails };
  error.problem = problem;
  return error;
}

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw await apiError(response, 'The request could not be completed.');
  return response.json() as Promise<T>;
}
