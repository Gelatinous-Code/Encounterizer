import 'server-only';

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: HeadersInit,
    readonly extensions?: Record<string, unknown>,
  ) {
    super(message);
  }
}
