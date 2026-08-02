import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './tests/worker/harness.ts',
      miniflare: {
        compatibilityDate: '2026-08-01',
        compatibilityFlags: ['nodejs_compat'],
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
            },
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
    }),
  ],
  test: {
    include: ['tests/worker/**/*.test.ts'],
  },
});
