# ADR 0002: Public application authentication

- **Status:** Accepted
- **Date:** 2026-08-01
- **Owners:** Encounterizer maintainers

## Decision

Encounterizer will use
[Better Auth](https://better-auth.com/docs/integrations/next) inside the
full-stack Worker, backed by D1 through its built-in Kysely D1/SQLite adapter.
Auth tables are part of the committed application migration history; production
does not run Better Auth migrations dynamically.

Cloudflare Access may protect operator-only tools or staging, but it is not the
public account system. Public authorization is based only on an Encounterizer
session plus the application membership model.

### Initial login methods

1. Verified email and password.
2. Google OAuth.

Passkeys are the preferred later passwordless method after CF-2 has shipped and
recovery telemetry exists. GitHub and other social providers are not launch
dependencies. Anonymous users may use public tools, but creating durable data,
joining a campaign, accepting an invitation, or publishing a share requires an
account.

Email verification, password reset, security notifications, and invitation
delivery require a configured transactional email service before email/password
is enabled in production. Turnstile and rate limits protect signup, login,
recovery, and invitation acceptance when abuse testing shows a public surface.

### Session contract

| Concern | Decision |
|---|---|
| Storage | Opaque session token in a secure cookie; authoritative session row in D1 |
| Cookie | `HttpOnly`, `Secure` in deployed environments, `SameSite=Lax`, host-only, `Path=/`; use the `__Host-` prefix in production |
| Idle lifetime | 7 days, extended no more than once per 24 hours while active |
| Absolute lifetime | 30 days from original authentication; require sign-in again after that point |
| Privileged freshness | Re-authenticate within 15 minutes for password/email changes, provider linking, ownership transfer, account deletion, or revoking all sessions |
| Rotation | Rotate after authentication, privilege-sensitive changes, recovery, and at the daily refresh boundary |
| Cookie cache | Disabled for authorization in CF-2; a later short-lived cache may improve rendering but cannot authorize a mutation |
| Validation | Every protected page/action/route validates the session server-side; a cookie-existence check is only an optimistic redirect |

Better Auth documents database-backed, rolling sessions and defaults to a
seven-day expiry with a one-day update interval. The explicit 30-day absolute
limit is an Encounterizer policy enforced from the original session creation
time. See [session management](https://better-auth.com/docs/concepts/session-management)
and [cookie behavior](https://better-auth.com/docs/concepts/cookies).

### Recovery, linking, and logout

- Password reset tokens are random, single-use, stored hashed, expire after 15
  minutes, and revoke all active sessions after a successful reset.
- Email verification tokens are single-use and expire after 24 hours. Resending
  invalidates the previous token and is rate limited.
- Social accounts are linked only from an already authenticated, recently
  re-authenticated settings flow. Implicit same-email linking is disabled, even
  when the provider reports a verified email.
- A user cannot unlink the final login method. Provider tokens stored for a
  required flow are encrypted at rest; unneeded refresh/access tokens are not
  retained.
- Normal logout revokes the current session row before clearing the cookie.
  “Log out all devices” revokes every session for the user. Account deletion
  also revokes all sessions before cleanup is queued.
- Redirect targets are relative application paths selected from an allowlist;
  arbitrary return URLs are rejected.

### Failure behavior

Authentication failure returns the standard problem envelope without revealing
whether an email exists. Cross-campaign authorization failures return `404`
where existence itself is private. The server never trusts identity, email,
role, or campaign claims supplied by the client.

## Alternatives considered

- **Cloudflare Access:** excellent for workforce/operator access, but it does
  not own Encounterizer accounts, campaign memberships, recovery, or consumer
  lifecycle requirements.
- **Stateless JWT-only sessions:** rejected because revocation, role changes,
  ownership transfer, and account deletion must take effect without waiting for
  a long-lived token to expire.
- **Custom authentication:** rejected because implementing OAuth, recovery,
  secure cookie behavior, and provider linking from scratch adds avoidable risk.

## Verification required in CF-2

Tests must cover fixation, CSRF, OAuth state/nonce, brute-force throttling,
recovery replay, session revocation, open redirects, implicit account-linking
rejection, last-login-method protection, and role changes during an active
session. Dependency updates require release-note review and an auth smoke test
in staging.
