# Encounterizer Cloudflare Cloud-Native Roadmap

- **Status:** Active product direction
- **Decision date:** 2026-08-01
- **Supersedes:** The browser-only, no-server architecture as the long-term target

## Product decision

Encounterizer will become a cloud-native application on Cloudflare. Cloudflare,
not browser storage, will be the authoritative runtime and system of record.
The browser will remain responsible for presentation and short-lived optimistic
state, but durable user and campaign data will be committed to the cloud.

This is not a hosting migration. It changes the application model:

- Next.js runs as a full-stack application on Cloudflare Workers through the
  OpenNext adapter.
- D1 owns relational application data and authorization relationships.
- R2 owns private user files and generated artifacts.
- Durable Objects own strongly consistent live-session state and WebSocket
  coordination.
- Queues and Workflows perform retryable or long-running background work.
- KV and edge caching may accelerate reads, but neither is authoritative.
- Workers AI, AI Gateway, and Vectorize remain optional product capabilities,
  not dependencies of the rules engine.

The full-stack Worker runtime is available in isolated staging. The current
static Azure deployment remains the temporary public-production baseline until
the CF-8 cutover retires it. Historical design documents describe the
constraints that applied when they were written; this roadmap governs new
platform work.

## Target platform map

| Concern | Target | Authority rule |
|---|---|---|
| Web application | Next.js on Workers via OpenNext | Worker executes server code and serves the app |
| Authentication | Application-level auth on Workers | Cloudflare Access is not the public user account system |
| Users and tenancy | D1 | Every owned row is scoped through campaign membership |
| Campaigns, parties, encounters, notes | D1 | Server writes are canonical |
| SRD and searchable catalog data | D1 plus edge caching | Seeded, versioned, and queryable server-side |
| User uploads and generated files | Private R2 buckets | Access is granted by the application, never by object-name secrecy |
| Live battles and player rooms | Durable Objects | One authoritative object per active room/session |
| Durable live-session history | D1 snapshots/events | Durable Object memory is never the only copy |
| Background jobs | Queues and Workflows | Jobs are idempotent and safe to retry |
| Secrets | Worker secrets/Secrets Store | No secrets in client bundles or repository files |
| Telemetry | Workers observability and Analytics Engine where useful | No gameplay content in logs by default |

## Delivery rules

1. Milestones are dependency-ordered release gates, not calendar estimates.
2. Every milestone must leave the application deployable and reversible.
3. Server authorization is checked on every owned resource; a client-supplied
   user or campaign ID is never trusted by itself.
4. D1 and Durable Object schemas change through committed migrations.
5. Browser storage must not remain a second source of truth. Temporary import
   code is allowed only for the explicit migration window.
6. Deterministic generators retain versioned seeds and regression fixtures when
   their execution moves from the browser to Workers.
7. Custom non-SRD content is private by default and is never exposed through a
   public bucket or indexed public route without an explicit sharing action.
8. New metered services require limits, usage visibility, and a budget owner
   before production enablement.

## Milestone overview

| ID | GitHub milestone name | Outcome | Depends on |
|---|---|---|---|
| CF-0 | Cloud Architecture & Delivery Contracts | Decisions, boundaries, and operational guardrails are explicit | — |
| CF-1 | Full-Stack Worker Foundation | The existing application runs on Workers with preview and production environments | CF-0 |
| CF-2 | Identity, Campaigns & Authorization | Users can authenticate and access only campaigns they are authorized to use | CF-1 |
| CF-3 | Cloud Party System | Parties and characters are server-authoritative in D1 | CF-2 |
| CF-4 | Cloud Encounters & Rules Compute | Generation, simulation, catalog queries, and saved encounters run through the cloud application | CF-3 |
| CF-5 | Cloud DM Workspace & Assets | Notes, DM screens, maps, imports, and files persist in D1/R2 | CF-3 |
| CF-6 | Live Session Runtime | Battles and player views are coordinated in real time by Durable Objects | CF-4, CF-5 |
| CF-7 | Background Processing & Automation | Expensive and retryable work runs outside request handlers | CF-5 |
| CF-8 | Production Cutover & Operations | Cloudflare is the production system and Azure/browser authority is retired | CF-6, CF-7 |
| CF-9 | Cloud Intelligence | Optional AI/search capabilities ship behind explicit controls | CF-8 |

CF-4 and CF-5 may proceed in parallel after CF-3. CF-7 can begin as soon as
the first background workload in CF-5 has a stable input/output contract.

## CF-0 — Cloud Architecture & Delivery Contracts

The accepted implementation contracts and repeatable baseline are indexed in
[`docs/architecture/README.md`](architecture/README.md).

### Outcome

The team can implement the platform without reopening foundational decisions in
every feature pull request.

### Work packages

- **CF-0.1 Architecture decision records:** Record the OpenNext runtime,
  server-authoritative data model, D1/R2/Durable Object boundaries, and the
  rule that KV is cache-only.
- **CF-0.2 Authentication decision:** Select the public application auth
  implementation and supported login methods. Define session lifetime,
  recovery, account linking, and logout behavior.
- **CF-0.3 Tenancy and permissions:** Define users, campaigns, owners, DMs,
  players, invitations, public shares, and resource ownership.
- **CF-0.4 API conventions:** Define validation, error envelopes,
  idempotency keys, pagination, optimistic concurrency, and request tracing.
- **CF-0.5 Data classification:** Classify account data, campaign content,
  custom copyrighted content, generated files, logs, and analytics.
- **CF-0.6 Cost and service budgets:** Establish initial request, CPU, D1,
  R2, Durable Object, and AI budgets plus alert thresholds.
- **CF-0.7 Performance baseline:** Capture current generation, simulation,
  search, bundle, and page-load benchmarks before moving compute.

### Exit gate

- Architecture and auth decisions are documented and approved.
- A threat model covers authentication, cross-campaign access, share tokens,
  uploads, and denial-of-wallet risks.
- Production/staging naming, ownership, budget alerts, and recovery objectives
  are recorded.
- The current application performance and deterministic outputs have fixtures
  that later milestones can compare against.

## CF-1 — Full-Stack Worker Foundation

Implementation and operator commands are maintained in
[`docs/operations/cloudflare-delivery.md`](operations/cloudflare-delivery.md).

### Outcome

Encounterizer is a deployable full-stack Cloudflare application. Existing tools
remain functional while server routes and platform bindings become available.

### Work packages

- **CF-1.1 OpenNext conversion:** Replace the static-export constraint with
  the Cloudflare OpenNext adapter and required Node.js compatibility settings.
- **CF-1.2 Wrangler configuration:** Add typed bindings, compatibility date,
  CPU limits, static assets, observability, and environment-specific config.
- **CF-1.3 Environment isolation:** Provision distinct local, preview/staging,
  and production resources; production data is never used by preview builds.
- **CF-1.4 Delivery pipeline:** Build, test, deploy previews, deploy production,
  and retain a documented rollback path.
- **CF-1.5 Server skeleton:** Add health/readiness behavior, request IDs,
  structured errors, security headers, and a minimal server-rendered route.
- **CF-1.6 Worker test harness:** Run integration tests inside the Workers
  runtime with local bindings rather than Node-only mocks.

### Exit gate

- A clean checkout can run the complete app locally through the Cloudflare
  runtime.
- Preview and production deployments use isolated resources and secrets.
- Existing public routes and deterministic generators pass regression tests.
- At least one server route and one server-rendered data path work in staging.
- Deployment, rollback, logs, and incident ownership are documented.

## CF-2 — Identity, Campaigns & Authorization

### Outcome

Every durable resource belongs to an authenticated user or campaign, and the
server enforces that relationship consistently.

### Work packages

- **CF-2.1 Identity schema:** Add D1 migrations for users, identities,
  sessions, verification/recovery records, and account lifecycle timestamps.
- **CF-2.2 Campaign tenancy:** Add campaigns, memberships, roles, invitations,
  and ownership-transfer rules.
- **CF-2.3 Authentication flows:** Implement sign-in, sign-out, session
  rotation, recovery, and safe return URLs.
- **CF-2.4 Authorization service:** Centralize resource and campaign checks;
  route handlers do not implement ad hoc permission logic.
- **CF-2.5 Abuse controls:** Add rate limits and Turnstile where anonymous or
  automated abuse can create cost or persistent state.
- **CF-2.6 Account controls:** Provide account export and deletion foundations,
  including cascade/retention rules for campaign-owned data.

### Exit gate

- Authentication works in local, preview, and production environments.
- Automated tests prove that users cannot enumerate, read, mutate, or delete
  another campaign's resources by changing IDs.
- Owners can invite/remove members and roles produce the documented behavior.
- Session fixation, CSRF, replay, open redirect, and brute-force controls have
  explicit tests or documented platform enforcement.
- Account deletion and campaign ownership edge cases have defined behavior.

## CF-3 — Cloud Party System

### Outcome

The first complete product vertical is cloud-native: campaigns, parties, and
characters are created, read, changed, and deleted through authenticated server
operations backed by D1.

### Work packages

- **CF-3.1 Party schema:** Model parties, characters, attendance, combat
  overrides, revisions, and audit timestamps with appropriate indexes.
- **CF-3.2 Server domain service:** Move validation, mutation rules, and
  revision increments behind server-only operations.
- **CF-3.3 Cloud Party UI:** Replace IndexedDB-backed Party Library operations
  with authenticated server reads and mutations plus transient optimistic UI.
- **CF-3.4 Concurrency contract:** Use revision preconditions or idempotent
  commands so stale clients cannot silently overwrite newer changes.
- **CF-3.5 Existing-data import:** Offer a one-time, explicit import of valid
  browser-resident parties into a chosen campaign, with preview and rollback.
- **CF-3.6 Backup and recovery:** Verify D1 export/restore and document how a
  party is recovered from operator error.

### Exit gate

- The same party appears correctly across two devices after login without
  relying on browser persistence.
- Simultaneous edits have deterministic conflict behavior and never silently
  discard a committed change.
- Invalid or future-version browser documents cannot corrupt cloud data.
- All party reads and writes are campaign-authorized and covered by integration
  tests.
- The temporary browser import can be removed without affecting normal use.

## CF-4 — Cloud Encounters & Rules Compute

### Outcome

Encounter creation, battle forecasts, catalog queries, and saved results execute
through the cloud application and can be reused across a campaign.

### Work packages

- **CF-4.1 Catalog ingestion:** Seed versioned SRD monsters, spells, rules,
  equipment, classes, and related metadata into queryable cloud storage.
- **CF-4.2 Catalog service:** Implement server-side search/filter/detail
  contracts with indexes, pagination, cache policy, and attribution metadata.
- **CF-4.3 Encounter compute:** Execute encounter generation in Workers using
  server-validated inputs and versioned deterministic seeds.
- **CF-4.4 Forecast compute:** Run and benchmark Monte Carlo forecasts in the
  Workers runtime. Keep synchronous execution only if it meets the accepted
  latency and CPU budget; otherwise introduce a job contract consumed by CF-7.
- **CF-4.5 Encounter persistence:** Store encounter inputs, engine version,
  output, map linkage, ownership, and immutable share snapshots.
- **CF-4.6 Custom content isolation:** Normalize private custom monsters and
  spells into campaign-scoped records without allowing non-SRD data into the
  public catalog.

### Exit gate

- Worker results match the deterministic fixtures and 2024 rules tests from
  the current engines.
- Server validation rejects tampered budgets, unauthorized custom content, and
  unsupported engine versions.
- Search and generation meet an explicit staging latency/CPU SLO under load.
- Saved encounters are reproducible after deployment using their recorded
  engine and content versions.
- Public shares disclose only the fields and licensed content intended by the
  sharing contract.

## CF-5 — Cloud DM Workspace & Assets

### Outcome

The DM's durable workspace lives in the cloud, including notes, screens, maps,
custom content, imports, exports, and generated artifacts.

### Work packages

- **CF-5.1 Workspace schema:** Model notes, DM screen layouts, pinned items,
  maps, map revisions, imports, and asset metadata in D1.
- **CF-5.2 Repository replacement:** Replace notes and DM-screen IndexedDB
  repositories with authorized server domain services and optimistic clients.
- **CF-5.3 Private R2 assets:** Store maps, portraits, handouts, PDFs, exports,
  and original imports under opaque campaign/user-scoped keys.
- **CF-5.4 Upload pipeline:** Validate authorization, file size, media type,
  checksum, quotas, and content disposition before accepting an upload.
- **CF-5.5 Download authorization:** Stream private assets through an authorized
  Worker or issue short-lived signed access; do not use public `r2.dev` URLs.
- **CF-5.6 Lifecycle and deletion:** Clean up replaced/orphaned assets and honor
  account/campaign export and deletion requests.
- **CF-5.7 Existing-data import:** Provide explicit cloud import for valid
  notes, DM screens, custom content, and saved maps found in browser storage.

### Exit gate

- Workspace data is available across devices without browser authority.
- Cross-campaign asset access and guessed object keys fail closed.
- Upload limits, malformed content, interrupted uploads, and duplicate retries
  have tested outcomes.
- D1 metadata and R2 objects cannot become permanently orphaned through normal
  application flows.
- A campaign export contains all supported structured data and referenced files.

## CF-6 — Live Session Runtime

### Outcome

DM and player clients share an authoritative real-time battle/session state
coordinated by Durable Objects.

### Work packages

- **CF-6.1 Session model:** Define room identity, participant roles, join
  tokens, lifecycle, commands, events, and persisted snapshots.
- **CF-6.2 Durable Object runtime:** Create one strongly consistent object per
  active session with typed commands and WebSocket hibernation.
- **CF-6.3 Battle authority:** Move initiative, turns, HP, conditions,
  concentration, reactions, and round transitions into server commands.
- **CF-6.4 Player view:** Publish an explicitly redacted projection rather than
  sending the DM state and hiding fields in the browser.
- **CF-6.5 Recovery:** Snapshot meaningful state to D1 and recover correctly
  after hibernation, eviction, deployment, or reconnect.
- **CF-6.6 Presence and reconnect:** Handle duplicate tabs, dropped sockets,
  stale commands, rejoin, and DM ownership changes.

### Exit gate

- Two or more devices observe ordered, authoritative state changes in staging.
- Duplicate/replayed commands are idempotent and stale commands cannot rewind
  the session.
- A hibernated, evicted, or newly deployed object restores without losing the
  latest acknowledged durable state.
- Player connections cannot retrieve DM-only notes, hidden creatures, or secret
  map data.
- Session close/archive produces a durable campaign record and releases active
  resources according to policy.

## CF-7 — Background Processing & Automation

### Outcome

Slow, expensive, and retryable work is removed from request handlers and has
observable lifecycle semantics.

### Work packages

- **CF-7.1 Job contract:** Define job IDs, ownership, status, progress, result,
  cancellation, retry, and expiration.
- **CF-7.2 Queue consumers:** Process imports, thumbnails, file inspection,
  cleanup, notifications, and other bounded background tasks idempotently.
- **CF-7.3 Workflows:** Use durable multi-step workflows for jobs such as full
  campaign export or artifact generation when queues alone are insufficient.
- **CF-7.4 User experience:** Show queued/running/succeeded/failed state and
  make retries explicit rather than leaving a request spinner open.
- **CF-7.5 Failure operations:** Add retry ceilings, poison-message handling,
  alerts, replay tooling, and retention/cleanup.

### Exit gate

- Retried or concurrently delivered jobs cannot duplicate user-visible output
  or corrupt ownership metadata.
- Request handlers return promptly after enqueueing eligible work.
- Operators can identify, inspect, replay, or terminate failed work without
  direct production database edits.
- Job payloads contain references rather than unnecessary sensitive document or
  file contents.

## CF-8 — Production Cutover & Operations

### Outcome

Cloudflare is the sole production application platform and durable authority.
The Azure static deployment and browser-backed repositories are retired.

### Work packages

- **CF-8.1 Production readiness:** Finalize dashboards, alerts, rate limits,
  WAF controls, Turnstile coverage, log sampling/redaction, and budget alerts.
- **CF-8.2 Recovery drills:** Exercise D1 restore, R2 recovery/retention,
  deployment rollback, Durable Object recovery, and compromised-secret rotation.
- **CF-8.3 Migration experience:** Ship account onboarding and explicit import
  for supported data from the former browser-only application.
- **CF-8.4 Domain cutover:** Move production traffic and canonical URLs to the
  Worker deployment with monitored rollback criteria.
- **CF-8.5 Decommissioning:** After the defined observation window, remove the
  Azure workflow, static-export configuration, and obsolete local repositories.
- **CF-8.6 Product and policy updates:** Publish accurate privacy, retention,
  data export/deletion, acceptable-use, attribution, and support documentation.
- **CF-8.7 Operational ownership:** Document incident severity, response,
  status communication, access control, and recurring dependency/schema upkeep.

### Exit gate

- Production traffic, authenticated writes, files, and live sessions operate on
  Cloudflare for the entire observation window within the agreed SLO and budget.
- Restore and rollback drills meet the recorded recovery objectives.
- No production feature depends on localStorage or IndexedDB for durable state.
- Azure can be disabled without losing routing, data, release automation, or
  rollback capability.
- Security, privacy, licensing, and account lifecycle documentation describes
  the shipped behavior rather than the former static application.

## CF-9 — Cloud Intelligence

### Outcome

Optional intelligent features improve preparation without weakening the
deterministic rules engine, privacy boundaries, or cost controls.

### Work packages

- **CF-9.1 AI Gateway:** Centralize provider access, observability, caching where
  appropriate, per-user limits, and emergency disable controls.
- **CF-9.2 Workers AI features:** Add bounded assistance such as encounter prose,
  summaries, or campaign-aware suggestions with explicit user initiation.
- **CF-9.3 Semantic retrieval:** Evaluate Vectorize for campaign and rules search
  using authorization-filtered source material and citation back-links.
- **CF-9.4 Evaluation:** Maintain accuracy, leakage, latency, and cost suites;
  AI output never changes official rules math without deterministic validation.
- **CF-9.5 Feature controls:** Gate rollout by environment, account, usage limit,
  and kill switch.

### Exit gate

- AI features are optional and core encounter, reference, and battle workflows
  remain available when they are disabled.
- Retrieval cannot cross campaign boundaries or surface private content through
  cached responses, logs, prompts, or embeddings.
- Per-feature quality and cost thresholds are measured before general release.
- Generated rules claims link to authoritative Encounterizer source records and
  are clearly distinguished from deterministic calculations.

## Definition of done for every milestone

A milestone is complete only when all applicable items below are true:

- Schema and Durable Object changes have forward migrations and a tested
  recovery/rollback procedure.
- Unit, integration, authorization, and Workers-runtime tests pass in CI.
- Validation and authorization live on the server, not only in React controls.
- Logs, metrics, traces, and alerts make the new capability operable.
- Usage limits and budget impact are measured and documented.
- Accessibility, responsive behavior, and print/export paths remain usable.
- Security, privacy, attribution, and retention documentation matches behavior.
- Temporary migration code has an owner and a removal milestone.
- The milestone exit gate is demonstrated in staging and recorded in its
  closing issue.

## Pull request and issue policy

- Create one GitHub milestone for each `CF-*` milestone above.
- Create one issue for each numbered work package and keep its identifier in the
  title, for example `CF-3.2: Add the server Party domain service`.
- A pull request should normally close one work-package issue. Split schema,
  runtime, or migration changes further when independent rollback is valuable.
- Cross-cutting defects discovered during a milestone belong to that milestone
  unless they block an earlier exit gate.
- Do not begin production cutover work merely because feature implementation is
  complete; CF-8 begins only after CF-6 and CF-7 exit gates pass.
