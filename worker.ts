// OpenNext generates this module during `npm run cf:build`. Keeping a stable
// source entrypoint makes Wrangler type generation reproducible before and
// after the generated artifact exists.
// @ts-ignore -- generated only for Cloudflare build/deploy commands
export * from './.open-next/worker.js';
// @ts-ignore -- generated only for Cloudflare build/deploy commands
export { default } from './.open-next/worker.js';
