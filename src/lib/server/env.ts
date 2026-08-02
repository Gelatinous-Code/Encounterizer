import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';

export type AppEnv = Omit<
  CloudflareEnv,
  | 'APP_ENV'
  | 'AUTH_EMAIL_ENABLED'
  | 'AUTH_ORIGIN'
  | 'AUTH_ALLOWED_HOSTS'
  | 'AUTH_TRUSTED_ORIGINS'
  | 'TURNSTILE_HOSTNAMES'
> & {
  APP_ENV?: string;
  AUTH_EMAIL_ENABLED?: string;
  AUTH_ORIGIN?: string;
  AUTH_ALLOWED_HOSTS?: string;
  AUTH_TRUSTED_ORIGINS?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_HOSTNAMES?: string;
  TURNSTILE_SECRET?: string;
  TEST_ONLY_TURNSTILE_BYPASS?: string;
};

export type AppContext = {
  env: AppEnv;
  ctx: ExecutionContext;
};

export async function getAppContext(): Promise<AppContext> {
  const context = await getCloudflareContext({ async: true });
  return context as AppContext;
}

export function csvValues(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function requireBinding<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} binding is required`);
  }
  return value;
}
