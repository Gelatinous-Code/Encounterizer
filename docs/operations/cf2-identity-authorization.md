# CF-2 identity, campaigns, and authorization

- **Owner:** Encounterizer maintainers (`@Daren9m` until delegated)
- **Applies to:** preview, staging, and production Workers
- **Configuration authority:** `wrangler.jsonc`, D1 migrations, and encrypted Worker secrets
- **Last verified locally:** 2026-08-01

## What CF-2 provides

Better Auth runs inside the OpenNext Worker and stores users, identities,
sessions, verification/recovery records, and rate limits in D1. Campaigns use
the same database for memberships, invitations, lifecycle events, and
metadata-only security audit records. Cookie state is never accepted as
campaign authority: each protected operation resolves the user session and
then checks current campaign membership in D1.

The role matrix is centralized in `src/lib/server/authorization.ts`:

| Capability | Owner | DM | Player |
|---|---:|---:|---:|
| Read campaign | Yes | Yes | Yes |
| Read member directory | Yes | Yes | Self only |
| Invite players | Yes | Yes | No |
| Invite DMs | Yes | No | No |
| Change roles / remove members | Yes | No | No |
| Change settings / delete campaign | Yes | No | No |

A campaign may have multiple owners but must retain at least one. The primary
owner is a lifecycle contact, not a stronger authorization role. Removing or
demoting the final owner returns `409`; account deletion returns `409` with the
campaigns whose ownership must first be transferred or deleted.

## Environment resources

| Environment | Worker | D1 database | Public origin |
|---|---|---|---|
| Preview | `encounterizer-main` version preview | `encounterizer-preview` | version preview URL |
| Staging | `encounterizer-stg` | `encounterizer-stg` | staging `workers.dev` URL |
| Production | `encounterizer-main` | `encounterizer-prod` | `encounterizer.com` and `www.encounterizer.com` |

Never point a non-production binding at `encounterizer-prod`. D1 migration
`0001_cf2_identity_campaigns.sql` is additive and must be applied before the
corresponding Worker version receives traffic.

## One-time activation

Generate a distinct, cryptographically random Better Auth secret for each
environment (at least 32 bytes) and enter it through Wrangler's encrypted
secret prompt. Do not place a value in source, shell history, logs, or a chat.

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_SECRET --env staging
npx wrangler secret put BETTER_AUTH_SECRET --env production
```

Create the Turnstile widget named `Encounterizer identity` with the actions
`signup`, `password-reset`, and `invitation-accept`. Its hostname set is:

- `localhost` and `127.0.0.1` for the local widget configuration only;
- the version-preview/staging Worker hostnames;
- `encounterizer.com` and `www.encounterizer.com` for production.

Commit each non-secret site key as `TURNSTILE_SITE_KEY` in the appropriate
Wrangler `vars` block. Store each secret key only with Wrangler:

```sh
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put TURNSTILE_SECRET --env staging
npx wrangler secret put TURNSTILE_SECRET --env production
```

The Worker verifies Turnstile server-side with the caller IP, expected action,
and an environment-specific hostname allowlist. Missing keys fail readiness and
the user interface pauses anonymous mutations. The workerd-only bypass requires
both `APP_ENV=local` and `TEST_ONLY_TURNSTILE_BYPASS=workerd`; that binding is
defined only in the test harness and must never appear in Wrangler config.

Enable Email Sending for `encounterizer.com`, let Cloudflare add/verify its DNS
records, and check the status before enabling public registration:

```sh
npx wrangler email sending enable encounterizer.com
npx wrangler email sending dns get encounterizer.com
```

The `EMAIL` binding is restricted to `noreply@encounterizer.com`. Authentication
logs and audit records must not contain email bodies, tokens, cookies, or reset
URLs. Google OAuth remains disabled unless both encrypted client credentials
are provisioned and its exact environment callback URL is registered.

## Migration and promotion

Local development and integration testing:

```sh
npm run cf:d1:migrate:local
npm run cf:build
npm run cf:test
```

Inspect and apply non-production migrations before deployment:

```sh
npm run cf:d1:pending
npm run cf:d1:migrate:preview
npm run cf:d1:migrate:staging
npm run cf:deploy:staging
```

Staging must pass all of these checks before production approval:

1. `/api/v1/system/readiness` reports every check as `pass`.
2. Registration requires Turnstile, sends verification email, and unverified
   users cannot accept invitations.
3. Sign-in, sign-out, recovery, and a second-device sign-in work.
4. An owner can create a campaign, invite a DM/player, change membership, and
   cannot remove the final owner.
5. A second account receives private `404` responses for another campaign ID.
6. Account export downloads JSON and account deletion blocks active ownership.

Production migration and deployment are protected manual-promotion steps in
`.github/workflows/deploy.yml`. Do not run `cf:d1:migrate:production` or
`cf:deploy:production` as part of pull-request validation.

## Security enforcement evidence

| Threat | Enforcement |
|---|---|
| Session fixation/theft | Opaque DB sessions, secure host cookies in cloud, cookie cache disabled, rotation/revocation, 7-day idle and 30-day absolute limits |
| CSRF | Explicit Origin allowlist plus Fetch Metadata on mutating application routes; Better Auth trusted origins on auth callbacks |
| Invitation replay/guessing | 256-bit random bearer value, SHA-256 hash at rest, seven-day expiry, revocation on reissue, verified-email binding, idempotent acceptance |
| Open redirect | Same-origin relative callback allowlist; adversarial absolute URL test |
| Brute force/automation | D1-backed endpoint rate limits plus Turnstile on registration, reset requests, and invitation acceptance |
| Cross-campaign IDOR | Central capability service, current D1 membership lookup, private `404` for non-members, bundled workerd negative tests |

Run `npm run cf:test` after every authentication, tenancy, route, or migration
change. The suite executes the generated OpenNext bundle inside workerd and
applies the real D1 migrations before testing.

## Recovery and rollback

Worker version rollback does not undo D1 migrations. Keep migrations additive
until the prior Worker version is no longer a rollback candidate. For an auth
incident, stop promotion, preserve request IDs and metadata-only logs, revoke or
rotate the affected Worker secret, and deploy the last known-good version. A
secret rotation intentionally invalidates cryptographic material; verify the
expected session/recovery impact in staging first.
