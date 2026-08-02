import 'server-only';

import { ApiProblem } from '@/lib/server/api';

export const CAMPAIGN_ROLES = ['owner', 'dm', 'player'] as const;
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export const CAMPAIGN_CAPABILITIES = [
  'campaign.read',
  'campaign.manage',
  'campaign.settings',
  'campaign.export',
  'campaign.delete',
  'member.directory.read',
  'member.player.manage',
  'member.dm.manage',
  'member.owner.manage',
  'session.join',
  'session.control',
] as const;

export type CampaignCapability = (typeof CAMPAIGN_CAPABILITIES)[number];

const ROLE_CAPABILITIES: Readonly<Record<CampaignRole, ReadonlySet<CampaignCapability>>> = {
  owner: new Set(CAMPAIGN_CAPABILITIES),
  dm: new Set([
    'campaign.read',
    'campaign.manage',
    'member.directory.read',
    'member.player.manage',
    'session.join',
    'session.control',
  ]),
  player: new Set([
    'campaign.read',
    'session.join',
  ]),
};

export type CampaignAccess = {
  campaignId: string;
  campaignName: string;
  primaryOwnerUserId: string;
  role: CampaignRole;
};

export function roleHasCapability(
  role: CampaignRole,
  capability: CampaignCapability,
): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export async function authorizeCampaign(
  db: D1Database,
  userId: string,
  campaignId: string,
  capability: CampaignCapability,
): Promise<CampaignAccess> {
  const access = await db.prepare(
    `SELECT c.id AS campaignId,
            c.name AS campaignName,
            c.primaryOwnerUserId,
            cm.role
       FROM campaign c
       JOIN campaignMembership cm ON cm.campaignId = c.id
      WHERE c.id = ?1
        AND cm.userId = ?2
        AND c.deletedAt IS NULL
      LIMIT 1`,
  ).bind(campaignId, userId).first<CampaignAccess>();

  if (!access) {
    // A private 404 prevents guessed campaign IDs from becoming an existence oracle.
    throw new ApiProblem(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
  }

  if (!roleHasCapability(access.role, capability)) {
    throw new ApiProblem(403, 'CAPABILITY_REQUIRED', 'Your campaign role cannot perform this action.');
  }

  return access;
}

export function capabilityForMemberChange(
  currentRole: CampaignRole | null,
  nextRole: CampaignRole | null,
): CampaignCapability {
  if (currentRole === 'owner' || nextRole === 'owner') return 'member.owner.manage';
  if (currentRole === 'dm' || nextRole === 'dm') return 'member.dm.manage';
  return 'member.player.manage';
}
