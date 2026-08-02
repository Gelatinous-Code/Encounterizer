# Data governance and threat model

- **Status:** Accepted baseline
- **Security owner:** Encounterizer maintainers
- **Review points:** CF-2, CF-5, CF-6, CF-8, and before any CF-9 AI feature

## Classification

| Class | Examples | Storage and exposure |
|---|---|---|
| Public | SRD 5.2.1 content, public marketing pages, intentionally published redacted snapshots | May be edge-cached and indexed; attribution and license metadata travel with content |
| Internal | Deployment config without secrets, aggregate service metrics, release identifiers | Maintainer access; no public listing; never used as an authorization secret |
| Private account data | Email, display name, identity-provider subject, session metadata, invitation target, IP/user-agent security metadata | D1 only; least-privilege server access; excluded from content logs and analytics |
| Confidential campaign data | Parties, encounters, notes, maps, live state, member list, generated files | Campaign-authorized D1/DO/private R2; never public or cross-campaign cached by default |
| Restricted content/secrets | Password hashes, session/recovery/invite/share tokens, OAuth tokens, application secrets | Strong one-way hashing for verifiers where possible; encryption/secrets bindings for recoverable material; never logged, cached, or sent to analytics |

Custom monsters, spells, imports, artwork, maps, and other user-supplied or
copyrighted material are confidential campaign data even when similar public SRD
content exists. A filename or R2 object key is not a classification control.

## Handling matrix

| Data set | Authority | Logs/analytics | Default retention | Deletion/export |
|---|---|---|---|---|
| Account/profile | D1 | Stable internal user ID only when required; no email | Account lifetime | Included in account export; delete after ownership resolution |
| Sessions and auth verifiers | D1 | Security outcome and pseudonymous ID; never token | Session expiry plus up to 30 days for security audit metadata | Revoke immediately; expired verifier rows purged |
| Campaign structured content | D1 | Counts/timings only, never content | Campaign lifetime | Included in campaign export; recoverable-delete window before purge |
| Custom/private files | Private R2 with D1 metadata | Size/type/outcome only; no object body or user filename | Referencing resource/campaign lifetime | Streamed export; idempotent object cleanup after metadata lifecycle |
| Active live-session state | Durable Object SQLite | Command type, duration, result; no hidden payload | Active session plus short recovery window | Archive approved projection to D1, then expire object state |
| Public shares | Immutable D1/R2 snapshot | Share ID hash and aggregate access count | Until expiry/revocation, then cleanup window | Owner can revoke/delete; exported as share metadata |
| Request logs/traces | Cloudflare observability | Already minimized | 30 days target | Not part of gameplay export; privacy deletion uses documented exceptions |
| Security/audit events | D1/approved log sink | Metadata only | 90 days target | Access-controlled; identifiers pseudonymized where feasible |
| Product analytics | Aggregated events | No raw campaign content, file names, emails, or IPs | 13 months maximum target | Honor applicable account consent/deletion mapping |

The exact retention configuration is implemented and verified before production
cutover. D1 Time Travel can retain deleted database history for its documented
recovery window; user-facing deletion notices must state that backup expiry is
not instantaneous.

## Trust boundaries and assets

Trust boundaries exist between the public network and Worker, browser and
server-derived principal, Worker and each binding, campaign tenants, DM and
player projections, public shares and private state, queue producer and
consumer, and operator access and production data.

Critical assets are credentials/verifiers, campaign confidentiality, ownership
and membership relationships, deterministic rules integrity, acknowledged live
commands, private files, service availability, and the monthly cost ceiling.

## Threat register

| Threat | Primary controls | Verification / owner milestone |
|---|---|---|
| Session theft, fixation, CSRF, OAuth replay, brute force | Secure host cookie, session rotation/revocation, origin/state/nonce checks, recent re-auth, rate limits, Turnstile where useful, generic recovery responses | CF-2 integration and adversarial tests |
| Cross-campaign IDOR or enumeration | Server-derived principal, membership join on every resource, centralized capabilities, scoped repository queries, private `404`, no cache authority | CF-2 authorization matrix and negative integration suite |
| Role change race or last-owner deletion | Transactional revision checks, fresh membership on writes, at-least-one-owner invariant, recent re-auth | CF-2 concurrent mutation tests |
| Invitation/share token guessing or replay | 256-bit random tokens, hash at rest, expiry, single use where applicable, revocation, throttling, no indexing | CF-2 invites; CF-4 public-share tests |
| DM secrets leak to players | Server-built player projection; never send full state and hide it with CSS/client code | CF-6 projection contract and payload snapshots |
| Malicious/oversized upload, path traversal, content sniffing | Authorized upload intent, opaque generated key, byte/type/checksum/quota validation, streaming, safe `Content-Disposition`, no executable public bucket | CF-5 upload and download tests |
| Orphaned or cross-tenant R2 object | D1 metadata authority, deterministic lifecycle states, idempotent cleanup, authorization before signed access | CF-5 reconciliation job and inventory test |
| Queue replay, poison work, duplicated side effect | Stable job ID, tenant authorization captured/revalidated, idempotent consumer, retry ceiling, dead-letter/failed state, bounded payload | CF-7 retry and replay tests |
| Stale or duplicated live-session command | Per-session DO ordering, command ID dedupe, expected revision, commit before acknowledgement, D1 archive | CF-6 reconnect/replay/recovery tests |
| Denial of service or denial of wallet | Route/user/campaign quotas, bounded query/page sizes, upload limits, Worker CPU limits, queue backpressure, service budgets and account alerts | CF-1 limits; each metered milestone; CF-8 load test |
| Data leakage through logs, traces, analytics, or errors | Allowlisted structured fields, payload redaction, standard safe problems, sampling, classification review | CF-1 log tests and CF-8 production audit |
| Dependency/build compromise or secret exposure | Lockfile, dependency review, least-privilege CI credentials, protected environments, secret bindings, no fork-secret exposure, reproducible build checks | CF-1 delivery pipeline and recurring maintenance |
| Cache poisoning or private response caching | KV cache-only rule, tenant/version-qualified keys, no private `public` cache directives, auth-aware cache bypass, purge on publication/version changes | CF-1 header tests; CF-4 catalog/share tests |
| Deterministic rules tampering or version drift | Committed hashes, engine/content version on stored result, signed release provenance, explicit fixture review | CF-0 baseline; CF-4 Worker parity tests |
| AI prompt/content leakage or runaway spend | AI disabled by default, explicit opt-in/data contract, no training assumption, redaction, provider review, per-feature spend cap and kill switch | CF-9 security/privacy review before enablement |

## Abuse and privacy defaults

- Anonymous reads are limited to licensed public data and explicit share
  snapshots. Anonymous callers cannot create unbounded persistent state.
- Upload, export, simulation, and background-job limits are enforced server-side,
  not only in the UI.
- User-facing errors contain enough information to recover but not enough to
  discover another tenant or internal storage layout.
- Operators use separate named accounts and just-in-time production access where
  the plan permits. Support workflows do not require users to send credentials
  or raw session tokens.
- AI/search indexing never receives confidential content until CF-9 defines an
  explicit per-feature data flow, deletion path, and cost owner.

## Incident minimum

Every suspected cross-tenant, credential, public-bucket, or secrets incident is
treated as high severity: disable the affected path, preserve metadata-only
evidence, rotate/revoke exposed credentials, identify affected tenants, restore
from a known safe point, and document the corrective control. CF-8 owns the
detailed runbook and drill.
