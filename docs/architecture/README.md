# Cloud architecture contracts

- **Status:** Accepted
- **Effective:** 2026-08-01
- **Decision owner:** Encounterizer maintainers
- **Review cadence:** At every milestone exit gate and whenever a selected
  platform capability changes materially

This directory is the implementation contract for the Cloudflare cloud-native
roadmap. A feature may refine these decisions, but it must not silently bypass
them. Changes that alter authority, tenancy, authentication, data exposure,
recovery objectives, or a cost guardrail require an ADR update in the same pull
request.

## CF-0 deliverables

| Work package | Contract |
|---|---|
| [CF-0.1](https://github.com/Gelatinous-Code/Encounterizer/issues/209) | [ADR 0001: Cloudflare application platform](adr/0001-cloudflare-application-platform.md) |
| [CF-0.2](https://github.com/Gelatinous-Code/Encounterizer/issues/210) | [ADR 0002: Public application authentication](adr/0002-public-application-authentication.md) |
| [CF-0.3](https://github.com/Gelatinous-Code/Encounterizer/issues/211) | [Tenancy and authorization](tenancy-and-authorization.md) |
| [CF-0.4](https://github.com/Gelatinous-Code/Encounterizer/issues/212) | [API conventions](api-conventions.md) |
| [CF-0.5](https://github.com/Gelatinous-Code/Encounterizer/issues/213) | [Data governance and threat model](data-governance-and-threat-model.md) |
| [CF-0.6](https://github.com/Gelatinous-Code/Encounterizer/issues/214) | [Environments, recovery, and service budgets](operations-and-service-budgets.md) |
| [CF-0.7](https://github.com/Gelatinous-Code/Encounterizer/issues/215) | [Performance and determinism baseline](performance-baseline.md) |

The committed machine-readable baseline is
[`baselines/local-static-export.json`](baselines/local-static-export.json).
Run `npm run baseline:cloud:check` to detect deterministic engine drift and
`npm run build && npm run baseline:cloud` to capture a fresh performance report.

## Non-negotiable invariants

1. The server derives the principal from a validated session and authorizes
   every owned resource. A client-provided user, campaign, or role is never
   authority.
2. D1 or a Durable Object transaction is the acknowledgement boundary for a
   durable mutation. Browser storage is not authoritative.
3. Custom and campaign content is private unless an explicit share produces a
   redacted snapshot.
4. KV and HTTP caches contain only reconstructable data and may be purged at
   any time without data loss.
5. New metered capabilities are disabled until they have an owner, quota,
   telemetry, and alert response in the service-budget contract.
6. Rules compute must preserve the committed deterministic fixtures unless an
   intentional engine-version change updates both the fixture and release notes.

## Approval and exceptions

Merging the pull request that changes a contract records approval in Git
history. An exception must name its owner, affected data and tenants, expiry
date, rollback, and the issue that removes it. Production exceptions without an
expiry are not permitted.

## CF-0 closure evidence

The repository-wide definition of done is applied proportionally because CF-0
changes contracts and verification fixtures, not a deployed schema or UI:

| Definition-of-done concern | CF-0 evidence |
|---|---|
| Schema/DO migration and rollback | Not applicable; CF-0 creates no cloud resource or schema. Migration and recovery rules are now mandatory for later milestones. |
| Automated checks | Production build, deterministic baseline check, typecheck, lint, and full test suite pass on the implementing pull request. |
| Server validation/authorization | The tenancy, auth, and API contracts define the required server enforcement; implementation and negative integration tests are gated in CF-2. |
| Operability and budgets | Request tracing, redaction, alert thresholds, service budgets, ownership, and incident actions are recorded. |
| Accessibility/responsive/print | Not applicable; no product UI or output path changes. |
| Security/privacy/retention | Classification, retention targets, trust boundaries, and the milestone threat register are recorded. |
| Temporary migration code | None introduced. |
| Staging demonstration | Not applicable until CF-1 creates the Worker staging runtime. The current production-style static export and local page-transfer baseline are captured for later comparison. |
