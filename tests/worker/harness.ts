interface HarnessEnv {
  APP: Fetcher;
  DB: D1Database;
  TEST_MIGRATIONS: Array<{ name: string; queries: string[] }>;
}

const harness = {
  fetch(request: Request, env: HarnessEnv): Promise<Response> {
    return env.APP.fetch(request);
  },
};

export default harness;
