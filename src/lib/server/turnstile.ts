import 'server-only';

import { ApiProblem } from '@/lib/server/api';
import { type AppEnv, csvValues } from '@/lib/server/env';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;

type TurnstileResult = {
  success?: boolean;
  action?: string;
  hostname?: string;
};

export async function requireTurnstile(options: {
  request: Request;
  env: AppEnv;
  action: 'signup' | 'password-reset' | 'invitation-accept';
}): Promise<void> {
  const token = options.request.headers.get('x-turnstile-token');
  const expectedHostnames = new Set(csvValues(options.env.TURNSTILE_HOSTNAMES));

  if (
    typeof token !== 'string'
    || token.length === 0
    || token.length > MAX_TOKEN_LENGTH
    || expectedHostnames.size === 0
  ) {
    throw verificationFailed();
  }

  // This binding exists only in the workerd test harness. It is intentionally
  // absent from every committed Wrangler environment and cannot enable a
  // deployed bypass.
  if (
    options.env.APP_ENV === 'local'
    && options.env.TEST_ONLY_TURNSTILE_BYPASS === 'workerd'
    && token === 'XXXX.DUMMY.TOKEN.XXXX'
  ) {
    return;
  }

  if (!options.env.TURNSTILE_SECRET) throw verificationFailed();

  let result: TurnstileResult;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret: options.env.TURNSTILE_SECRET,
        response: token,
        remoteip: options.request.headers.get('cf-connecting-ip') ?? '',
        idempotency_key: crypto.randomUUID(),
      }),
    });
    if (!response.ok) throw new Error(`siteverify ${response.status}`);
    result = await response.json<TurnstileResult>();
  } catch {
    throw verificationFailed();
  }

  if (
    result.success !== true
    || result.action !== options.action
    || typeof result.hostname !== 'string'
    || !expectedHostnames.has(result.hostname)
  ) {
    throw verificationFailed();
  }
}

function verificationFailed(): ApiProblem {
  return new ApiProblem(403, 'BOT_VERIFICATION_FAILED', 'Human verification failed.');
}
