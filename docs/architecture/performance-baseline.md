# Performance and determinism baseline

- **Status:** Accepted baseline
- **Captured:** 2026-08-01 local date / 2026-08-02 UTC
- **Source:** `codex/cf0-architecture-contracts`, before OpenNext conversion
- **Runtime:** Node 24.18.1, Windows x64, Next.js static export
- **Artifact:** [`baselines/local-static-export.json`](baselines/local-static-export.json)

This baseline protects two different properties:

1. Deterministic hashes are correctness gates and must match on every machine.
2. Timings and byte counts are comparison measurements, not portable CI pass/fail
   limits. They establish the pre-cloud reference and must be re-measured on the
   same class of runner and in staging.

## Repeat the baseline

```bash
npm ci
npm run build
npm run baseline:cloud
npm run baseline:cloud:check
```

`baseline:cloud:check` recomputes and compares deterministic fields with the
committed JSON. `baseline:cloud` prints a fresh report without overwriting the
approved artifact. An intentional fixture change is reviewed and committed with
an engine/content version change and release note.

## Workload definitions

| Workload | Fixture |
|---|---|
| Encounter generation | Four level-8 characters, High, Forest, CR 1–10, seed `20260801`; 250 seeded generation samples |
| Battle simulation | Level-8 champion/life cleric/evoker/thief against three Ogres, seed `20260801`; canonical 1,000-iteration result and five measured 500+ iteration samples |
| Catalog search | All 331 current monsters; “fire”, CR 2–17, Forest/Mountain, CR descending; 1,000 samples |
| Bundle | Uncompressed bytes in the complete `out/` export and `_next/static` JS/CSS |
| Page load | Ten local HTTP fetches of `/` and every root HTML-referenced critical JS/CSS/font asset, with a warmed local static server |

The local page measurement captures document/asset transfer and routing overhead.
It is not a claim about network latency, rendering, LCP, CLS, INP, or a real-user
Core Web Vitals distribution. A Chrome DevTools CWV trace was not available in
the CF-0 execution environment. CF-1 must add cold-cache browser traces against
staging from at least one desktop and one mobile profile before production
promotion.

## Captured results

| Workload | Current result |
|---|---:|
| Encounter generation | p50 0.062 ms; p95 0.136 ms |
| Battle simulation | p50 2.656 ms; p95 2.971 ms per measured invocation |
| Catalog search | p50 0.040 ms; p95 0.101 ms |
| Complete static export | 95,937,146 bytes |
| `_next/static` | 5,549,613 bytes |
| JavaScript / CSS in `_next/static` | 5,022,357 / 89,233 bytes |
| Root HTML | 73,090 bytes |
| Root critical assets | 15 assets / 860,978 uncompressed bytes |
| Local document response | p50 6.327 ms; p95 10.584 ms |
| Local document plus critical transfer | p50 18.192 ms; p95 30.269 ms |

The complete export includes the image-heavy public asset corpus, so it is not
the amount transferred by the root route. The per-route critical asset measure
is the useful transfer comparison.

## Deterministic fixtures

| Output | SHA-256 |
|---|---|
| Encounter | `056cfd7a18784b8bffe25923a483173f335f78a30794a1edc15ac6f8c835ee19` |
| Simulation | `180dca36069279557ad1a348db859d5e24bc7e88ba08f2c397e1310cd6f16d22` |
| Search result | `eb468a5e7b8cf911ba905b317ebb3042547c9d5cbbf72c0fe7241512e4095da8` |

Exact hashes are required when these engines move into a Worker. If runtime
floating-point or serialization differences make a byte hash inappropriate, the
migration PR must replace it with an explicit field-level fixture before
removing this gate; it may not simply ignore the mismatch.

## Migration budgets

These are engineering gates for CF-1 and CF-4, measured after warm-up with the
same fixtures:

- Deterministic fixture hashes match exactly.
- Worker p95 encounter generation stays at or below 10 ms CPU.
- Worker p95 1,000-iteration simulation stays at or below 25 ms CPU; otherwise
  forecast execution moves behind a job contract before broad release.
- Worker p95 in-memory catalog search stays at or below 5 ms CPU. D1-backed
  catalog search separately targets p95 150 ms end-to-end in staging.
- Root critical uncompressed assets do not grow more than 10% above 860,978
  bytes without an approved exception and route-level split plan.
- Production/staging browser goals use current Core Web Vitals guidance: p75 LCP
  at or below 2.5 s, CLS at or below 0.1, and INP at or below 200 ms. These are
  verified from current primary guidance when the trace is captured, not treated
  as immutable platform constants.

Timing budgets include enough headroom for runtime and database overhead while
remaining far below the monthly Worker CPU warning budget. They must be adjusted
from observed staging data rather than silently relaxed to make a check pass.

## Baseline change policy

A pull request that changes a deterministic hash includes the before/after
fixture, reason, engine/content version, migration impact on saved artifacts,
and reviewer approval. A pull request that materially changes timing or bytes
includes the same-run comparison and explains whether the change is accepted,
optimized, or deferred behind a tracked issue.
