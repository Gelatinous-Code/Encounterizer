# Environments, recovery, and service budgets

- **Status:** Accepted targets
- **Effective:** 2026-08-01
- **Platform and incident owner:** Encounterizer maintainers
- **Budget owner:** Product owner (`@Daren9m` until delegated)

## Environment contract

| Environment | Worker | Data rule | Promotion |
|---|---|---|---|
| Local | `encounterizer-local` through Wrangler/Miniflare | Local bindings and seeded fixtures only | Developer checks |
| Pull request | `encounterizer-pr-<number>` | Ephemeral or test-only resources; authentication providers use preview callbacks; never production bindings | Automated preview after checks |
| Staging | `encounterizer-stg` | Dedicated non-production D1, R2, KV, queues, DO namespaces, secrets, hostnames, and test accounts | Main-branch deployment; smoke and migration checks |
| Production | `encounterizer-prod` | Dedicated production bindings and secrets with least-privilege CI access | Protected environment approval after staging |

Resource names use `encounterizer-<env>-<purpose>`, for example
`encounterizer-prod-app`, `encounterizer-prod-primary`, and
`encounterizer-prod-assets`. Binding variable names are stable across
environments (`DB`, `ASSETS`, `CACHE`, `LIVE_SESSIONS`); Wrangler environment
configuration changes only the bound resource.

Preview and staging may never read, clone, or restore production user data.
Sanitized, generated fixtures are used instead. A preview that needs persistence
gets a namespaced resource and an expiry/cleanup owner; otherwise it runs with
local/ephemeral storage.

Production secrets are entered through Cloudflare secret controls and GitHub
protected environments. Secret values do not appear in Wrangler files, CI
output, preview builds, or telemetry. Deploy credentials are scoped to only the
required account and resources.

## Delivery and rollback

1. Build and test the exact OpenNext artifact once.
2. Apply forward-tested staging migrations, deploy staging, and run smoke tests.
3. Require approval for production schema/deployment.
4. Apply backward-compatible production migrations before code that requires
   them. Destructive cleanup waits until the prior release cannot run.
5. Roll back code by promoting the last known-good Worker version. Database
   rollback uses an explicit corrective migration or D1 recovery, never an
   unreviewed reverse script.

Every release records the Git SHA, Worker version, compatibility date, migration
set, and engine/content versions. CF-1 owns the detailed commands; CF-8 drills
them.

## Recovery objectives

These are product objectives, not claims that Cloudflare contractually
guarantees them.

| Asset | RPO target | RTO target | Recovery design |
|---|---:|---:|---|
| Worker code/config | 0 committed releases | 15 minutes | Promote last known-good version and bindings |
| D1 account/campaign data | 1 minute for operator error | 2 hours | D1 Time Travel bookmark/restore, migration record, post-restore validation |
| Active live-session acknowledged command | 0 commands | 15 minutes | Commit in SQLite-backed DO before ack; reconstruct from durable state; archive snapshots/events to D1 |
| Archived live-session history | 1 minute | 2 hours | D1 recovery plus command/snapshot validation |
| R2 private assets | 24 hours | 8 hours | D1 manifest, checksum inventory, recoverable-delete window, scheduled backup/export design completed before CF-8 |
| Secrets/provider credentials | Last known valid rotation | 1 hour | Documented rotation order, dual-key window where supported, session/token revocation |

Cloudflare documents D1 Time Travel as always-on, no-additional-cost recovery to
any minute within the last 30 days for supported databases. The production
runbook will use bookmarks and verify tenant counts/checksums after restore; it
will not overwrite production until an operator has captured the incident point.
See [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).

R2 recovery is not assumed from D1 Time Travel. Until CF-8 proves a separate R2
backup/restore path, user-visible hard deletion uses a recoverable queue and the
24-hour RPO is a launch gate, not a guarantee.

## Pricing baseline

Pricing below is a planning snapshot as of 2026-08-01 and must be rechecked at
each milestone that enables a service:

- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/):
  the Paid plan has a $5/month account minimum and currently includes 10 million
  requests plus 30 million CPU milliseconds per month.
- The same pricing page currently lists 25 billion D1 rows read, 50 million rows
  written, and 5 GB-month stored data in the Paid plan before usage charges.
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/): Standard storage
  currently includes 10 GB-month, 1 million Class A operations, 10 million Class
  B operations, and free Internet egress each month.
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/):
  Paid currently includes 1 million requests and 400,000 GB-seconds monthly;
  hibernation is required for idle WebSockets to avoid unnecessary duration.

Included amounts are not design targets. Encounterizer alert budgets remain well
below them so an inefficient query or abuse pattern is visible early.

## Account budget alerts

Cloudflare budget alerts are account-wide, evaluate usage-based spend, and are
informational rather than hard caps. The recurring $5 Workers subscription is
not usage-based spend. Alerts may arrive after usage processing, so product
quotas and kill switches remain necessary. See
[Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/).

Configure and verify these recipients before the first production deploy:

| Threshold | Response |
|---:|---|
| $10 usage spend in a billing cycle | Budget owner reviews product breakdown and daily trend within one business day |
| $25 | Freeze enablement of new metered features; investigate query/upload/job outliers the same day |
| $50 | Incident response: disable the offending optional path, tighten quotas, and document owner/rollback before re-enable |

CF-1 records a screenshot or API/export evidence that the alerts and recipients
exist. CF-8 verifies alert delivery and the response runbook.

## Internal service budgets

| Meter | Monthly warning budget | Product guardrail | Owner action |
|---|---:|---|---|
| Dynamic Worker requests | 5 million | Cache only public/derived reads; rate-limit anonymous and mutation routes | Review top routes and bot traffic |
| Worker CPU | 15 million ms | Route-specific CPU limit; synchronous compute must meet CF-4 baseline/SLO | Move bounded slow work to queue/workflow or optimize |
| D1 rows read | 2.5 billion | Indexed tenant-scoped queries, cursor max 100, query metrics | Inspect query plans and reject scans before promotion |
| D1 rows written | 5 million | Batch/transaction related writes; dedupe retries | Inspect hot commands and retry loops |
| D1 storage | 2 GB-month | Retention jobs and no binary payloads | Audit large tables/indexes |
| R2 Standard storage | 5 GB-month | 25 MB default object limit; 1 GB/account and 5 GB/campaign soft quota at beta | Pause new uploads for tenant at quota; offer cleanup/export |
| R2 Class A / B | 250k / 2.5m | Multipart only when needed; no polling/list loops | Inspect upload and asset-delivery patterns |
| Durable Object requests | 500k | Enable only in CF-6; batch state notifications and dedupe commands | Review room/message fan-out |
| Durable Object duration | 100k GB-s | WebSocket hibernation, no open outbound connection while idle | Kill/repair non-hibernating room code |
| Queues/Workflows | 250k queue ops / 100k workflow steps | Job quotas, retry ceilings, dead-letter state | Stop poison/retry storms |
| Workers AI / Vectorize / AI Gateway | $0 before CF-9 | No production binding or API key; explicit per-feature opt-in and kill switch | Separate approved budget and privacy review required |

Beta quotas are intentionally conservative and can be raised from observed use.
Quota errors use the API problem contract and never silently drop a committed
mutation.

## Operational review

At each monthly billing cycle and milestone exit, the owner records actual
spend, request/CPU/storage trends, largest tenants, quota denials, and any
budget-alert event. Raising a warning budget requires observed capacity need and
an updated cost estimate; a Cloudflare included-tier increase alone is not a
reason to remove product limits.
