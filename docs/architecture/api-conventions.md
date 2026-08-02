# API conventions

- **Status:** Accepted
- **Applies from:** CF-1
- **Owner:** Encounterizer maintainers

The HTTP API is a versioned boundary over the same domain services used by
server components and server actions. Auth routes mounted by Better Auth are
the only exception to the `/api/v1` prefix.

## Resource and command shape

- JSON property names are `camelCase`; database column names remain
  `snake_case` behind repositories.
- Identifiers are opaque UUIDv7/ULID-style strings. Clients do not parse them or
  infer creation time/tenancy from them.
- Dates are UTC RFC 3339 strings. Durations are integer seconds or milliseconds
  with the unit in the property name.
- Request bodies are size-limited, parsed once, and validated with Zod schemas
  shared only at the transport boundary. Unknown properties are rejected for
  writes. Domain invariants are checked again inside the domain service.
- HTTP routes use nouns for resources. State transitions with meaningful rules
  use commands, for example `POST /api/v1/campaigns/{id}/ownership-transfers`.
- Server actions may improve UI ergonomics but cannot create a second mutation
  contract or bypass validation, authorization, idempotency, or concurrency.

## Success responses

- `200` for a successful read/update or idempotent replay with a body.
- `201` plus `Location` for resource creation.
- `202` for queued work, returning a job resource URL.
- `204` for a successful delete/action with no representation.
- Responses that contain a mutable resource include its integer `revision` and
  weak ETag: `W/"<resource-id>:<revision>"`.

Collections return an envelope:

```json
{
  "items": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

Cursor pagination is the default. Cursors are opaque, URL-safe, signed or
integrity-protected, and bind the filter plus stable `(sortValue, id)` position.
Default page size is 50; maximum is 100. Offset pagination is allowed only for a
small immutable reference list.

## Error envelope

Errors use RFC 9457 Problem Details with content type
`application/problem+json`:

```json
{
  "type": "https://encounterizer.com/problems/revision-conflict",
  "title": "The resource changed",
  "status": 412,
  "detail": "Reload the encounter and apply the change again.",
  "instance": "/api/v1/encounters/01J...",
  "code": "REVISION_CONFLICT",
  "requestId": "01J...",
  "errors": [
    { "path": "monsters.0.count", "code": "too_small" }
  ]
}
```

`detail` is safe for an end user and contains no stack, SQL, secret, object key,
or cross-tenant identifier. `errors` is present only for field validation. Error
codes are stable; titles/details may be improved without an API version change.

| Status | Use |
|---|---|
| `400` | Malformed JSON, invalid cursor, or structurally invalid request |
| `401` | Missing/invalid application session |
| `403` | Authenticated but a non-secret global capability is denied |
| `404` | Resource absent or its existence is private to another tenant |
| `409` | Idempotency-key reuse with different input or domain-state conflict |
| `412` | `If-Match` revision no longer current |
| `413` / `415` | Payload too large / unsupported media type |
| `422` | Syntactically valid command violates a domain rule |
| `429` | Rate/quota limit, with `Retry-After` when known |
| `500` / `503` | Unexpected failure / dependency temporarily unavailable |

## Idempotency

`Idempotency-Key` is required for resource creation, publish/share operations,
uploads/finalization, ownership transfers, and asynchronous job submission. It
is recommended for every client-retryable command.

The server stores `(principal, route, key, request fingerprint, status,
response reference)` for at least 24 hours. An exact replay returns the original
status and representation without repeating side effects. Reusing the key with
different canonical input returns `409 IDEMPOTENCY_KEY_REUSED`. Queue consumers
also carry a stable job/command ID and deduplicate independently; HTTP
idempotency alone does not make at-least-once work safe.

## Optimistic concurrency

Mutable resources carry a monotonically increasing integer revision. Update and
delete requests require `If-Match`; a missing precondition returns `428`, and a
stale one returns `412`. The compare and mutation happen in one transaction.
The server never implements last-write-wins for campaign content.

Append-only events and commutative operations may use command idempotency rather
than ETags, but the domain contract must state that choice explicitly.

## Request tracing and logs

- Accept a valid W3C `traceparent` and create a trace when absent.
- Generate an opaque `requestId` for every request and return `X-Request-Id`.
- Record Cloudflare `cf-ray` as infrastructure correlation, not as the public
  request ID.
- Structured logs include route template, method, status, duration, environment,
  release, request ID, trace ID, and coarse tenant hash when necessary. They do
  not include bodies, cookies, tokens, emails, notes, custom content, or object
  keys.
- Server timing may expose named aggregate phases, never tenant or SQL details.

## Compatibility

Breaking HTTP changes require a new API major version. Additive optional fields
and new endpoints do not. Stored rules artifacts also record their engine and
content versions; API versioning alone is not reproducibility versioning.
