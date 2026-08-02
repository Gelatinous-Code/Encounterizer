import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
      return {
        main: './tests/worker/harness.ts',
        miniflare: {
        compatibilityDate: '2026-08-01',
        compatibilityFlags: ['nodejs_compat'],
        bindings: {
          TEST_MIGRATIONS: migrations,
        },
        d1Databases: { DB: 'encounterizer-test-db' },
        serviceBindings: {
          APP: 'encounterizer-app',
        },
        workers: [
          {
            name: 'encounterizer-app',
            modules: [{ type: 'ESModule', path: './.worker-test/worker.js' }],
            modulesRoot: './.worker-test',
            unsafeUseModuleFallbackService: true,
            compatibilityDate: '2026-08-01',
            compatibilityFlags: ['nodejs_compat'],
            bindings: {
              APP_ENV: 'local',
              AUTH_EMAIL_ENABLED: 'false',
              AUTH_ORIGIN: 'https://encounterizer.test',
              AUTH_ALLOWED_HOSTS: 'encounterizer.test',
              AUTH_TRUSTED_ORIGINS: 'https://encounterizer.test',
              BETTER_AUTH_SECRET: 'workerd-only-better-auth-secret-32-chars-minimum',
              TURNSTILE_HOSTNAMES: 'encounterizer.test',
              TEST_ONLY_TURNSTILE_BYPASS: 'workerd',
            },
            d1Databases: { DB: 'encounterizer-test-db' },
            assets: {
              workerName: 'encounterizer-app',
              directory: './.open-next/assets',
              binding: 'ASSETS',
              routerConfig: {
                has_user_worker: true,
                invoke_user_worker_ahead_of_assets: true,
              },
            },
            versionMetadata: 'WORKER_VERSION',
          },
        ],
        },
      };
    }),
  ],
  test: {
    include: ['tests/worker/**/*.test.ts'],
    setupFiles: ['./tests/worker/apply-migrations.ts'],
  },
});
