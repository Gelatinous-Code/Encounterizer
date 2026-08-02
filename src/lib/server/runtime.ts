import 'server-only';

import { getAppContext } from '@/lib/server/env';

const CLOUD_ENVIRONMENTS = new Set(['local', 'preview', 'staging', 'production']);

export type RuntimeIdentity = {
  environment: string;
  versionId: string;
  versionTag: string;
  deployedAt: string | null;
  source: 'cloudflare' | 'next-dev';
  hasStaticAssets: boolean;
  hasDatabase: boolean;
  hasAuthSecret: boolean;
  hasTurnstile: boolean;
  hasTransactionalEmail: boolean;
};

export type ReadinessCheck = {
  status: 'pass' | 'fail';
  detail: string;
};

export async function readRuntimeIdentity(): Promise<RuntimeIdentity> {
  try {
    const { env } = await getAppContext();
    const version = env.WORKER_VERSION;

    return {
      environment: env.APP_ENV ?? 'unknown',
      versionId: version?.id ?? 'local',
      versionTag: version?.tag ?? 'local',
      deployedAt: version?.timestamp ?? null,
      source: 'cloudflare',
      hasStaticAssets: env.ASSETS !== undefined,
      hasDatabase: env.DB !== undefined,
      hasAuthSecret: (env.BETTER_AUTH_SECRET?.length ?? 0) >= 32,
      hasTurnstile: Boolean(
        (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET)
        || (env.APP_ENV === 'local' && env.TEST_ONLY_TURNSTILE_BYPASS === 'workerd'),
      ),
      hasTransactionalEmail: env.AUTH_EMAIL_ENABLED !== 'true' || env.EMAIL !== undefined,
    };
  } catch {
    // `next dev` remains useful before Wrangler's platform proxy is ready. A
    // production readiness check still fails closed when this fallback is used.
    return {
      environment: process.env.APP_ENV ?? 'local',
      versionId: 'next-dev',
      versionTag: 'next-dev',
      deployedAt: null,
      source: 'next-dev',
      hasStaticAssets: false,
      hasDatabase: false,
      hasAuthSecret: false,
      hasTurnstile: false,
      hasTransactionalEmail: false,
    };
  }
}

export function evaluateReadiness(runtime: RuntimeIdentity): {
  ready: boolean;
  checks: Record<string, ReadinessCheck>;
} {
  const runtimeContextReady = runtime.source === 'cloudflare';
  const environmentReady = CLOUD_ENVIRONMENTS.has(runtime.environment);
  const assetsReady = runtime.hasStaticAssets;
  const nextDevelopmentFallback = process.env.NODE_ENV !== 'production' && runtime.source === 'next-dev';

  const checks: Record<string, ReadinessCheck> = {
    runtimeContext: {
      status: runtimeContextReady || nextDevelopmentFallback ? 'pass' : 'fail',
      detail: runtimeContextReady ? 'Cloudflare request context available' : 'Using Next.js development fallback',
    },
    environment: {
      status: environmentReady ? 'pass' : 'fail',
      detail: environmentReady ? `Environment is ${runtime.environment}` : 'APP_ENV is missing or unsupported',
    },
    staticAssets: {
      status: assetsReady || nextDevelopmentFallback ? 'pass' : 'fail',
      detail: assetsReady ? 'ASSETS binding available' : 'ASSETS binding unavailable outside Cloudflare',
    },
    database: {
      status: runtime.hasDatabase || nextDevelopmentFallback ? 'pass' : 'fail',
      detail: runtime.hasDatabase ? 'D1 binding available' : 'D1 binding unavailable outside Cloudflare',
    },
    authSecret: {
      status: runtime.hasAuthSecret || nextDevelopmentFallback ? 'pass' : 'fail',
      detail: runtime.hasAuthSecret ? 'Authentication secret configured' : 'Authentication secret missing or too short',
    },
    turnstile: {
      status: runtime.hasTurnstile || nextDevelopmentFallback ? 'pass' : 'fail',
      detail: runtime.hasTurnstile ? 'Turnstile verification configured' : 'Turnstile site and secret keys are required',
    },
    transactionalEmail: {
      status: runtime.hasTransactionalEmail || nextDevelopmentFallback ? 'pass' : 'fail',
      detail: runtime.hasTransactionalEmail ? 'Transactional email requirement satisfied' : 'Email sending binding unavailable',
    },
  };

  return {
    ready: Object.values(checks).every((check) => check.status === 'pass'),
    checks,
  };
}
