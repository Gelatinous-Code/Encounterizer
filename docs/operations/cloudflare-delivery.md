# Cloudflare delivery and rollback

- **Owner:** Encounterizer maintainers (`@Daren9m` until delegated)
- **Runtime:** Next.js on Cloudflare Workers through OpenNext
- **Configuration authority:** `wrangler.jsonc`
- **Last verified:** 2026-08-01

## Environment boundary

| Target | Worker | Runtime variable | Persistent-data rule |
|---|---|---|---|
| Local | `encounterizer-local` | `APP_ENV=local` | Local emulation and committed fixtures only |
| Pull-request preview | `encounterizer-main` version preview | `APP_ENV=preview` | No production bindings or data; never promoted automatically |
| Staging | `encounterizer-stg` | `APP_ENV=staging` | Dedicated non-production bindings and secrets only |
| Production | `encounterizer-main` | `APP_ENV=production` | Production bindings and secrets only; receives an approved version promotion |

Bindings are repeated in every named Wrangler environment because binding and
`vars` configuration is not inherited. Future D1, R2, KV, Queue, and Durable
Object resources must follow the same pattern; a production resource ID must
never appear under local, preview, or staging.

Production owns the `encounterizer.com` and `www.encounterizer.com` Custom
Domains. They are committed under `env.production.routes`; the production
Worker does not expose its generic `workers.dev` hostname.

## Developer gate

From a clean checkout on Node 24:

```sh
npm ci
npm run cf:typegen:check
npm run cf:build
npm run cf:test
npm run cf:dry-run
npm run cf:startup
npm run preview
```

`npm run preview` runs the generated OpenNext Worker under the local Cloudflare
runtime. Verify `/status`, `/api/v1/system/health`, and
`/api/v1/system/readiness` before publishing.

When `wrangler.jsonc` bindings change, run `npm run cf:typegen` and commit the
generated `cloudflare-env.d.ts` in the same pull request.

The package install policy approves only the pinned native setup scripts needed
by esbuild, workerd, and the resolver. Sharp's install script is explicitly
denied while Next's image optimizer is disabled. Do not use
`npm audit fix --force`: npm currently proposes an incompatible Next 14
downgrade for Next 16's transitive Sharp advisory. Revisit the denial when the
supported Next/OpenNext line accepts Sharp 0.35 or later.

## Pull-request previews

The repository-connected Cloudflare Worker is `encounterizer-main`. Pull-request
builds upload non-production versions to that Worker without promoting them. In
**Workers & Pages → encounterizer-main → Settings → Build**, use these committed
commands:

| Setting | Value |
|---|---|
| Build command | `npm run cf:build` |
| Deploy command | `npm run cf:upload:preview` |
| Non-production deploy command | `npm run cf:upload:preview` |
| Production branch | `main` |

Uploading a version produces a versioned preview URL without promoting it to a
live production deployment. Pull-request previews and production are immutable
versions of the same Worker; only the protected production job may promote a
version to active traffic. The Worker name in the dashboard must remain equal
to the top-level Wrangler name (`encounterizer-main`).

## Staging and production

`.github/workflows/deploy.yml` builds once, tests the generated artifact inside
workerd, deploys it to staging, and retains that exact artifact for an optional
production promotion.

Configure these GitHub controls before enabling automatic staging delivery:

- Repository variable `CLOUDFLARE_DELIVERY_ENABLED=true`.
- Staging environment secrets `CLOUDFLARE_ACCOUNT_ID` and a least-privilege
  `CLOUDFLARE_API_TOKEN` allowed to deploy `encounterizer-stg`.
- Production environment secrets with production-only deployment access.
- Optional `CLOUDFLARE_STAGING_URL` and `CLOUDFLARE_PRODUCTION_URL` variables for
  post-deploy readiness smoke tests.
- Required reviewers on the GitHub `production` environment.

A push to `main` deploys staging when delivery is enabled. Production is only
available through a manual workflow dispatch with `promote_to_production=true`;
the protected environment approval is the promotion gate.

## CF-1 staging verification

On 2026-08-01, Worker version
`ac1fea6c-e799-4cb9-877f-68c4946572e6` was deployed to
`https://encounterizer-stg.dnd-new-dawn-guild-assistant.workers.dev`. The
deployed liveness route returned `ok`, readiness returned all checks `pass`, and
the server-rendered `/status` route returned `200` with staging metadata.

## Rollback

1. Stop further promotions and identify the last known-good Worker version from
   the deployment record and health metadata.
2. Inspect versions with `npx wrangler versions list --env production`.
3. Shift 100% of production traffic to the known-good version with
   `npx wrangler versions deploy <VERSION_ID>@100% --env production`.
4. Confirm `/api/v1/system/health`, `/api/v1/system/readiness`, `/status`, and a
   representative deterministic generator.
5. Record the incident, Git SHA, bad and restored Worker version IDs, operator,
   timestamps, and follow-up owner.

Worker rollback does not reverse data migrations. Migrations remain
backward-compatible until the prior Worker can no longer be selected; data
recovery uses a reviewed corrective migration or the service-specific recovery
procedure.

## Logs and incident response

- Tail a non-production deployment with `npx wrangler tail --env staging`.
- Use Workers Observability to correlate `requestId`, route, status,
  environment, and duration. Request/response bodies, cookies, tokens, user
  content, and object keys are not logged.
- The liveness route proves the Worker can answer. Readiness fails with an RFC
  9457-style `503` when required runtime capabilities are absent.
- During an incident, preserve the failing Worker version and logs before
  rollback; do not debug by attaching preview code to production data.
