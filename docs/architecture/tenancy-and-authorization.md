# Tenancy and authorization contract

- **Status:** Accepted
- **Applies from:** CF-2
- **Owner:** Encounterizer maintainers

## Tenant model

A campaign is the isolation boundary for gameplay content. Users are global
identities. A user gains campaign access only through an active membership or a
separate, narrowly scoped public-share capability.

Core relationships:

```text
user ──< identity / session
user ──< campaign_membership >── campaign
campaign ──< party / encounter / note / map / asset / live_session
campaign ──< invitation
campaign resource ──< immutable share_snapshot
```

Every campaign-owned row has a non-null `campaign_id`. R2 object metadata has a
matching campaign and resource owner in D1. Personal preferences may use
`user_id`; a gameplay resource is never implicitly personal merely because its
creator is known.

## Roles

| Capability | Owner | DM | Player | Public share |
|---|:---:|:---:|:---:|:---:|
| View campaign and member directory | Yes | Yes | Limited | No |
| Manage parties, encounters, notes, maps, custom content | Yes | Yes | No | No |
| Start/control a live session | Yes | Yes | No | No |
| Join a live session and change own permitted state | Yes | Yes | Yes | No |
| View player-safe projections/handouts | Yes | Yes | Yes | Snapshot only |
| Invite/remove players | Yes | Yes | No | No |
| Invite/remove DMs | Yes | No | No | No |
| Promote/demote an owner or DM | Yes | No | No | No |
| Change campaign settings, export, or delete | Yes | No | No | No |
| Transfer billing/primary ownership responsibility | Yes | No | No | No |

A campaign may have multiple owners. It must always have at least one active
owner. The final owner cannot leave, be removed, delete their account, or be
demoted until another owner accepts ownership or the campaign is explicitly
deleted. A DM cannot remove or change an owner.

“Player” is the baseline membership role. Live-session participant permissions
are an additional capability derived from campaign membership and session state;
they do not upgrade the campaign role.

## Authorization algorithm

Every server operation follows this order:

1. Validate the database-backed session and derive `principal.userId`.
2. Parse the external identifier, but do not infer authority from it.
3. Load the resource joined to its active campaign membership in one query (or
   one transaction where mutation is required).
4. Evaluate the centralized capability for the operation and current role.
5. Validate command state/revision and perform the mutation transactionally.
6. Emit a metadata-only audit event for sensitive changes.

Route handlers do not implement ad hoc role conditionals. They call a shared
authorization service using named capabilities such as `campaign.manage`,
`encounter.write`, `session.control`, or `asset.read`. D1 queries include both
resource ID and campaign scope. A guessed valid resource ID from another
campaign fails closed.

Cached role or membership information is never sufficient for a privileged
write. Membership removal and role reduction take effect on the next protected
operation without requiring logout.

## Invitations

- Invitations target a normalized email, a campaign, and either `dm` or
  `player`; owner promotion occurs only after joining.
- Tokens contain at least 256 bits of randomness, are stored as hashes, are
  single-use, and expire after 7 days.
- Only the invited, verified email may accept. Authentication is required before
  acceptance and acceptance is idempotent.
- Reissue revokes the prior token. Removing a member invalidates their pending
  invitations and live-session capabilities.
- Invitation lookup and acceptance are rate limited and do not reveal campaign
  data until the identity matches.

## Public shares

A public share is not a campaign membership and never queries live private state
directly. Publishing creates an immutable, versioned, redacted snapshot with a
separate share identifier. The public URL contains a random capability token;
only its hash is stored.

Shares have an explicit scope, creation time, creator, content version, optional
expiry, and revocation time. Downloads use a redacted projection and private R2
objects through an authorized Worker response or short-lived signed access.
Revocation blocks future access immediately, while already downloaded material
cannot be recalled.

Search engines receive `noindex` for capability URLs. Public responses do not
contain campaign IDs, member details, DM notes, hidden creatures, original
uploads, or custom content not selected for the snapshot.

## Resource lifecycle

- Creator IDs provide attribution, not access. Deleting/removing a creator does
  not orphan campaign data.
- Campaign delete is owner-only, recently re-authenticated, and initially enters
  a recoverable deletion workflow. R2 cleanup is idempotent and follows D1
  metadata deletion.
- Account deletion removes personal identity data, then either transfers owned
  campaigns, deletes them by explicit choice, or blocks until the invariant is
  resolved.
- Cross-tenant reads, writes, enumeration, exports, shares, and asset downloads
  require automated integration tests before the CF-2 exit gate.
