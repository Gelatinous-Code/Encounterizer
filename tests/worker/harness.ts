interface HarnessEnv {
  APP: Fetcher;
}

const harness = {
  fetch(request: Request, env: HarnessEnv): Promise<Response> {
    return env.APP.fetch(request);
  },
};

export default harness;
