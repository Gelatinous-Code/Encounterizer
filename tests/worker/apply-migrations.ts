/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';

const testEnv = env as unknown as {
  DB: D1Database;
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
};

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
