import { defineConfig, globalIgnores } from 'eslint/config';
import coreWebVitals from 'eslint-config-next/core-web-vitals';

// Flat config (ESLint 9+). eslint-config-next/core-web-vitals bundles the
// base, TypeScript, and Core Web Vitals rule sets for Next.js 16.
export default defineConfig([
  ...coreWebVitals,
  globalIgnores([
    '.next/**',
    '.open-next/**',
    '.worker-test/**',
    '.wrangler/**',
    'out/**',
    'next-env.d.ts',
    'cloudflare-env.d.ts',
  ]),
]);
