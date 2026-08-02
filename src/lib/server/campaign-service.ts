import 'server-only';

import { ApiProblem } from '@/lib/server/api';
import {
  authorizeCampaign,
  capabilityForMemberChange,
  roleHasCapability,
  type CampaignRole,
} from '@/lib/server/authorization';

type AuditInput = {
  actorUserId: string;
  campaignId: string;
  eventType: string;
  targetId?: string;
  requestId: string;
  metadata?: Record<string, string>;
};

export type CampaignSummary = {
  id: string;
  name: string;
  primaryOwnerUserId: string;
  role: CampaignRole;
  createdAt: number;
  updatedAt: number;
};

export async function createCampaign(options: {
  db: D1Database;
  userId: string;
  name: string;
  requestId: string;
}): Promise<CampaignSummary> {
  const id = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const now = Date.now();

  await options.db.batch([
    options.db.prepare(
      `INSERT INTO campaign
         (id, name, primaryOwnerUserId, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?4)`,
    ).bind(id, options.name, options.userId, now),
    options.db.prepare(
      `INSERT INTO campaignMembership
         (id, campaignId, userId, role, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, 'owner', ?4, ?4)`,
    ).bind(membershipId, id, options.userId, now),
    auditStatement(options.db, {
      actorUserId: options.userId,
      campaignId: id,
      eventType: 'campaign.created',
      targetId: id,
      requestId: options.requestId,
    }),
  ]);

  return {
    id,
    name: options.name,
    primaryOwnerUserId: options.userId,
    role: 'owner',
    createdAt: now,
    updatedAt: now,
  };
}

export async function listCampaigns(
  db: D1Database,
  userId: string,
): Promise<CampaignSummary[]> {
  const result = await db.prepare(
    `SELECT c.id, c.name, c.primaryOwnerUserId, cm.role, c.createdAt, c.updatedAt
       FROM campaignMembership cm
       JOIN campaign c ON c.id = cm.campaignId
      WHERE cm.userId = ?1
        AND c.deletedAt IS NULL
      ORDER BY c.updatedAt DESC, c.id`,
  ).bind(userId).all<CampaignSummary>();
  return result.results;
}

export async function updateCampaign(options: {
  db: D1Database;
  actorUserId: string;
  campaignId: string;
  name: string;
  requestId: string;
}): Promise<void> {
  await authorizeCampaign(options.db, options.actorUserId, options.campaignId, 'campaign.settings');
  const now = Date.now();
  await options.db.batch([
    options.db.prepare('UPDATE campaign SET name = ?1, updatedAt = ?2 WHERE id = ?3')
      .bind(options.name, now, options.campaignId),
    auditStatement(options.db, {
      actorUserId: options.actorUserId,
      campaignId: options.campaignId,
      eventType: 'campaign.updated',
      targetId: options.campaignId,
      requestId: options.requestId,
    }),
  ]);
}

export async function deleteCampaign(options: {
  db: D1Database;
  actorUserId: string;
  campaignId: string;
  requestId: string;
}): Promise<void> {
  await authorizeCampaign(options.db, options.actorUserId, options.campaignId, 'campaign.delete');
  const now = Date.now();
  await options.db.batch([
    options.db.prepare('UPDATE campaign SET deletedAt = ?1, updatedAt = ?1 WHERE id = ?2 AND deletedAt IS NULL')
      .bind(now, options.campaignId),
    auditStatement(options.db, {
      actorUserId: options.actorUserId,
      campaignId: options.campaignId,
      eventType: 'campaign.deletion_requested',
      targetId: options.campaignId,
      requestId: options.requestId,
    }),
  ]);
}

export type CampaignMember = {
  userId: string;
  name: string;
  email: string;
  role: CampaignRole;
  createdAt: number;
};

export async function listCampaignMembers(options: {
  db: D1Database;
  actorUserId: string;
  campaignId: string;
}): Promise<CampaignMember[]> {
  const access = await authorizeCampaign(
    options.db,
    options.actorUserId,
    options.campaignId,
    'campaign.read',
  );
  const canReadDirectory = roleHasCapability(access.role, 'member.directory.read');
  const result = await options.db.prepare(
    `SELECT u.id AS userId, u.name, u.email, cm.role, cm.createdAt
       FROM campaignMembership cm
       JOIN user u ON u.id = cm.userId
      WHERE cm.campaignId = ?1
        AND (?2 = 1 OR cm.userId = ?3)
      ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'dm' THEN 1 ELSE 2 END,
               lower(u.name), u.id`,
  ).bind(options.campaignId, canReadDirectory ? 1 : 0, options.actorUserId)
    .all<CampaignMember>();
  return result.results;
}

export async function changeMemberRole(options: {
  db: D1Database;
  actorUserId: string;
  campaignId: string;
  targetUserId: string;
  nextRole: CampaignRole;
  requestId: string;
}): Promise<void> {
  const target = await membership(options.db, options.campaignId, options.targetUserId);
  if (!target) throw new ApiProblem(404, 'MEMBER_NOT_FOUND', 'Campaign member not found.');

  await authorizeCampaign(
    options.db,
    options.actorUserId,
    options.campaignId,
    capabilityForMemberChange(target.role, options.nextRole),
  );

  if (target.role === options.nextRole) return;
  const statements: D1PreparedStatement[] = [];
  if (target.role === 'owner' && options.nextRole !== 'owner') {
    const replacement = await otherOwner(
      options.db,
      options.campaignId,
      options.targetUserId,
    );
    if (!replacement) throw finalOwnerProblem();

    const campaign = await options.db.prepare(
      'SELECT primaryOwnerUserId FROM campaign WHERE id = ?1',
    ).bind(options.campaignId).first<{ primaryOwnerUserId: string }>();
    if (campaign?.primaryOwnerUserId === options.targetUserId) {
      statements.push(
        options.db.prepare('UPDATE campaign SET primaryOwnerUserId = ?1, updatedAt = ?2 WHERE id = ?3')
          .bind(replacement.userId, Date.now(), options.campaignId),
      );
    }
  }

  statements.push(
    options.db.prepare(
      'UPDATE campaignMembership SET role = ?1, updatedAt = ?2 WHERE campaignId = ?3 AND userId = ?4',
    ).bind(options.nextRole, Date.now(), options.campaignId, options.targetUserId),
    auditStatement(options.db, {
      actorUserId: options.actorUserId,
      campaignId: options.campaignId,
      eventType: 'member.role_changed',
      targetId: options.targetUserId,
      requestId: options.requestId,
      metadata: { from: target.role, to: options.nextRole },
    }),
  );
  try {
    await options.db.batch(statements);
  } catch (error) {
    if (isFinalOwnerConstraint(error)) throw finalOwnerProblem();
    throw error;
  }
}

export async function removeCampaignMember(options: {
  db: D1Database;
  actorUserId: string;
  campaignId: string;
  targetUserId: string;
  requestId: string;
}): Promise<void> {
  const target = await membership(options.db, options.campaignId, options.targetUserId);
  if (!target) throw new ApiProblem(404, 'MEMBER_NOT_FOUND', 'Campaign member not found.');
  await authorizeCampaign(
    options.db,
    options.actorUserId,
    options.campaignId,
    capabilityForMemberChange(target.role, null),
  );

  const statements: D1PreparedStatement[] = [];
  if (target.role === 'owner') {
    const replacement = await otherOwner(options.db, options.campaignId, options.targetUserId);
    if (!replacement) throw finalOwnerProblem();
    const campaign = await options.db.prepare(
      'SELECT primaryOwnerUserId FROM campaign WHERE id = ?1',
    ).bind(options.campaignId).first<{ primaryOwnerUserId: string }>();
    if (campaign?.primaryOwnerUserId === options.targetUserId) {
      statements.push(
        options.db.prepare('UPDATE campaign SET primaryOwnerUserId = ?1, updatedAt = ?2 WHERE id = ?3')
          .bind(replacement.userId, Date.now(), options.campaignId),
      );
    }
  }

  statements.push(
    options.db.prepare('DELETE FROM campaignMembership WHERE campaignId = ?1 AND userId = ?2')
      .bind(options.campaignId, options.targetUserId),
    options.db.prepare(
      `UPDATE campaignInvitation
          SET revokedAt = ?1, updatedAt = ?1
        WHERE campaignId = ?2
          AND email = (SELECT email FROM user WHERE id = ?3)
          AND acceptedAt IS NULL
          AND revokedAt IS NULL`,
    ).bind(Date.now(), options.campaignId, options.targetUserId),
    auditStatement(options.db, {
      actorUserId: options.actorUserId,
      campaignId: options.campaignId,
      eventType: 'member.removed',
      targetId: options.targetUserId,
      requestId: options.requestId,
      metadata: { role: target.role },
    }),
  );
  try {
    await options.db.batch(statements);
  } catch (error) {
    if (isFinalOwnerConstraint(error)) throw finalOwnerProblem();
    throw error;
  }
}

export async function transferPrimaryOwnership(options: {
  db: D1Database;
  actorUserId: string;
  campaignId: string;
  targetUserId: string;
  requestId: string;
}): Promise<void> {
  await authorizeCampaign(
    options.db,
    options.actorUserId,
    options.campaignId,
    'member.owner.manage',
  );
  const target = await membership(options.db, options.campaignId, options.targetUserId);
  if (!target) throw new ApiProblem(404, 'MEMBER_NOT_FOUND', 'Campaign member not found.');
  const now = Date.now();
  await options.db.batch([
    options.db.prepare(
      `UPDATE campaignMembership
          SET role = 'owner', updatedAt = ?1
        WHERE campaignId = ?2 AND userId = ?3`,
    ).bind(now, options.campaignId, options.targetUserId),
    options.db.prepare(
      'UPDATE campaign SET primaryOwnerUserId = ?1, updatedAt = ?2 WHERE id = ?3',
    ).bind(options.targetUserId, now, options.campaignId),
    auditStatement(options.db, {
      actorUserId: options.actorUserId,
      campaignId: options.campaignId,
      eventType: 'campaign.primary_owner_transferred',
      targetId: options.targetUserId,
      requestId: options.requestId,
    }),
  ]);
}

export type CreatedInvitation = {
  id: string;
  token: string;
  expiresAt: number;
};

export async function createCampaignInvitation(options: {
  db: D1Database;
  actorUserId: string;
  campaignId: string;
  email: string;
  role: Exclude<CampaignRole, 'owner'>;
  requestId: string;
}): Promise<CreatedInvitation> {
  await authorizeCampaign(
    options.db,
    options.actorUserId,
    options.campaignId,
    capabilityForMemberChange(null, options.role),
  );

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  const email = options.email.trim().toLowerCase();

  await options.db.batch([
    options.db.prepare(
      `UPDATE campaignInvitation
          SET revokedAt = ?1, updatedAt = ?1
        WHERE campaignId = ?2
          AND email = ?3
          AND acceptedAt IS NULL
          AND revokedAt IS NULL`,
    ).bind(now, options.campaignId, email),
    options.db.prepare(
      `INSERT INTO campaignInvitation
         (id, campaignId, email, role, tokenHash, invitedByUserId,
          expiresAt, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
    ).bind(
      id,
      options.campaignId,
      email,
      options.role,
      tokenHash,
      options.actorUserId,
      expiresAt,
      now,
    ),
    auditStatement(options.db, {
      actorUserId: options.actorUserId,
      campaignId: options.campaignId,
      eventType: 'invitation.created',
      targetId: id,
      requestId: options.requestId,
      metadata: { role: options.role },
    }),
  ]);

  return { id, token, expiresAt };
}

export async function acceptCampaignInvitation(options: {
  db: D1Database;
  userId: string;
  email: string;
  emailVerified: boolean;
  token: string;
  requestId: string;
}): Promise<{ campaignId: string; role: Exclude<CampaignRole, 'owner'> }> {
  if (!options.emailVerified) {
    throw new ApiProblem(403, 'VERIFIED_EMAIL_REQUIRED', 'Verify your email before accepting an invitation.');
  }
  const tokenHash = await hashToken(options.token);
  const invitation = await options.db.prepare(
    `SELECT i.id, i.campaignId, i.email, i.role, i.expiresAt,
            i.acceptedAt, i.revokedAt
       FROM campaignInvitation i
       JOIN campaign c ON c.id = i.campaignId
      WHERE i.tokenHash = ?1
        AND i.email = ?2
        AND c.deletedAt IS NULL
      LIMIT 1`,
  ).bind(tokenHash, options.email.toLowerCase()).first<{
    id: string;
    campaignId: string;
    email: string;
    role: Exclude<CampaignRole, 'owner'>;
    expiresAt: number;
    acceptedAt: number | null;
    revokedAt: number | null;
  }>();

  if (!invitation || invitation.revokedAt || invitation.expiresAt <= Date.now()) {
    throw new ApiProblem(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
  }

  const existing = await membership(options.db, invitation.campaignId, options.userId);
  if (invitation.acceptedAt) {
    if (existing) return { campaignId: invitation.campaignId, role: invitation.role };
    throw new ApiProblem(404, 'INVITATION_NOT_FOUND', 'Invitation not found.');
  }

  const now = Date.now();
  await options.db.batch([
    options.db.prepare(
      `INSERT INTO campaignMembership
         (id, campaignId, userId, role, createdAt, updatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(campaignId, userId) DO UPDATE SET
         role = excluded.role,
         updatedAt = excluded.updatedAt`,
    ).bind(
      crypto.randomUUID(),
      invitation.campaignId,
      options.userId,
      invitation.role,
      now,
    ),
    options.db.prepare(
      `UPDATE campaignInvitation
          SET acceptedAt = ?1, updatedAt = ?1
        WHERE id = ?2 AND acceptedAt IS NULL AND revokedAt IS NULL`,
    ).bind(now, invitation.id),
    auditStatement(options.db, {
      actorUserId: options.userId,
      campaignId: invitation.campaignId,
      eventType: 'invitation.accepted',
      targetId: invitation.id,
      requestId: options.requestId,
      metadata: { role: invitation.role },
    }),
  ]);
  return { campaignId: invitation.campaignId, role: invitation.role };
}

async function membership(
  db: D1Database,
  campaignId: string,
  userId: string,
): Promise<{ userId: string; role: CampaignRole } | null> {
  return db.prepare(
    'SELECT userId, role FROM campaignMembership WHERE campaignId = ?1 AND userId = ?2',
  ).bind(campaignId, userId).first<{ userId: string; role: CampaignRole }>();
}

async function otherOwner(
  db: D1Database,
  campaignId: string,
  excludedUserId: string,
): Promise<{ userId: string } | null> {
  return db.prepare(
    `SELECT userId
       FROM campaignMembership
      WHERE campaignId = ?1
        AND role = 'owner'
        AND userId <> ?2
      ORDER BY createdAt, userId
      LIMIT 1`,
  ).bind(campaignId, excludedUserId).first<{ userId: string }>();
}

function finalOwnerProblem(): ApiProblem {
  return new ApiProblem(
    409,
    'FINAL_OWNER_REQUIRED',
    'A campaign must keep at least one owner. Promote another member or delete the campaign first.',
  );
}

function isFinalOwnerConstraint(error: unknown): boolean {
  return error instanceof Error && error.message.includes('FINAL_OWNER_REQUIRED');
}

function auditStatement(db: D1Database, input: AuditInput): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO securityAuditEvent
       (id, actorUserId, campaignId, eventType, targetId,
        occurredAt, requestId, metadataJson)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(
    crypto.randomUUID(),
    input.actorUserId,
    input.campaignId,
    input.eventType,
    input.targetId ?? null,
    Date.now(),
    input.requestId,
    JSON.stringify(input.metadata ?? {}),
  );
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
