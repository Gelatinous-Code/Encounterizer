PRAGMA foreign_keys = ON;

-- Better Auth 1.6.25 core schema. Dates are stored as epoch milliseconds by
-- its D1/Kysely adapter. All schema changes are committed migrations; the
-- application never performs production DDL at request time.
CREATE TABLE user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  emailVerified INTEGER NOT NULL DEFAULT 0 CHECK (emailVerified IN (0, 1)),
  image TEXT,
  deletionRequestedAt INTEGER,
  deletedAt INTEGER,
  lastExportedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE UNIQUE INDEX user_email_uidx ON user (email);

CREATE TABLE session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  absoluteExpiresAt INTEGER NOT NULL
);

CREATE UNIQUE INDEX session_token_uidx ON session (token);
CREATE INDEX session_userId_idx ON session (userId);
CREATE INDEX session_absoluteExpiresAt_idx ON session (absoluteExpiresAt);

CREATE TABLE account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX account_userId_idx ON account (userId);
CREATE UNIQUE INDEX account_provider_uidx ON account (providerId, accountId);

CREATE TABLE verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX verification_identifier_idx ON verification (identifier);
CREATE INDEX verification_expiresAt_idx ON verification (expiresAt);

CREATE TABLE rateLimit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);

CREATE UNIQUE INDEX rateLimit_key_uidx ON rateLimit (key);

CREATE TABLE campaign (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  primaryOwnerUserId TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  deletedAt INTEGER
);

CREATE INDEX campaign_primaryOwnerUserId_idx ON campaign (primaryOwnerUserId);

CREATE TABLE campaignMembership (
  id TEXT PRIMARY KEY NOT NULL,
  campaignId TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'dm', 'player')),
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE UNIQUE INDEX campaignMembership_campaign_user_uidx
  ON campaignMembership (campaignId, userId);
CREATE INDEX campaignMembership_userId_idx ON campaignMembership (userId);

CREATE TABLE campaignInvitation (
  id TEXT PRIMARY KEY NOT NULL,
  campaignId TEXT NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('dm', 'player')),
  tokenHash TEXT NOT NULL,
  invitedByUserId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  expiresAt INTEGER NOT NULL,
  acceptedAt INTEGER,
  revokedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE UNIQUE INDEX campaignInvitation_tokenHash_uidx
  ON campaignInvitation (tokenHash);
CREATE INDEX campaignInvitation_campaign_email_idx
  ON campaignInvitation (campaignId, email);
CREATE INDEX campaignInvitation_expiresAt_idx
  ON campaignInvitation (expiresAt);

CREATE TABLE accountLifecycleEvent (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT,
  eventType TEXT NOT NULL CHECK (eventType IN ('exported', 'deletion_requested', 'deleted')),
  occurredAt INTEGER NOT NULL,
  requestId TEXT NOT NULL
);

CREATE INDEX accountLifecycleEvent_userId_idx ON accountLifecycleEvent (userId);
CREATE INDEX accountLifecycleEvent_occurredAt_idx ON accountLifecycleEvent (occurredAt);

CREATE TABLE securityAuditEvent (
  id TEXT PRIMARY KEY NOT NULL,
  actorUserId TEXT,
  campaignId TEXT,
  eventType TEXT NOT NULL,
  targetId TEXT,
  occurredAt INTEGER NOT NULL,
  requestId TEXT NOT NULL,
  metadataJson TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX securityAuditEvent_campaign_time_idx
  ON securityAuditEvent (campaignId, occurredAt);
CREATE INDEX securityAuditEvent_actor_time_idx
  ON securityAuditEvent (actorUserId, occurredAt);
