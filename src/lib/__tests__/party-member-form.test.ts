import { describe, expect, it } from 'vitest';
import {
  normalizePartyCombatOverrides,
  parseCombatOverrideInput,
  partyMemberToFormValues,
  validatePartyMemberForm,
} from '@/lib/party-member-form';
import type { PartyMemberDraft } from '@/lib/party';

function memberFixture(): PartyMemberDraft {
  return {
    id: 'member-aria',
    name: 'Aria',
    playerName: 'Dana',
    templateId: 'fighter-champion',
    classLabel: 'Champion Fighter',
    level: 5,
    initiativeBonus: 3,
    passivePerception: 14,
    notes: 'Carries the moon key.',
    overrides: {
      ac: 19,
      maxHp: 52,
      saveBonuses: { dex: 3, con: 6, wis: 1 },
    },
  };
}

describe('Party member form', () => {
  it('preserves intermediate numeric input states for validation', () => {
    expect(parseCombatOverrideInput('')).toBeUndefined();
    expect(parseCombatOverrideInput('-')).toBeNaN();
    expect(parseCombatOverrideInput('.')).toBeNaN();
    expect(parseCombatOverrideInput('1.')).toBe(1);
    expect(parseCombatOverrideInput('-2.5')).toBe(-2.5);
  });

  it('round-trips a durable member without sharing nested combat overrides', () => {
    const member = memberFixture();
    const values = partyMemberToFormValues(member);
    const result = validatePartyMemberForm(values);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toEqual(member);
    result.member.overrides!.saveBonuses!.con = 99;
    expect(member.overrides!.saveBonuses!.con).toBe(6);
  });

  it('retains raw invalid numeric states and reports each field precisely', () => {
    const values = partyMemberToFormValues(memberFixture());
    values.name = '   ';
    values.level = '';
    values.initiativeBonus = '2.5';
    values.passivePerception = '101';
    values.overrides = {
      ac: 0,
      maxHp: 10.5,
      saveBonuses: { dex: 3, con: 4, wis: 500 },
    };

    const result = validatePartyMemberForm(values);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toMatchObject({
      name: expect.any(String),
      level: expect.any(String),
      initiativeBonus: expect.any(String),
      passivePerception: expect.any(String),
      ac: expect.any(String),
      maxHp: expect.any(String),
      wisSave: expect.any(String),
    });
    expect(values.level).toBe('');
  });

  it('trims optional text and omits cleared table details', () => {
    const values = partyMemberToFormValues(memberFixture());
    values.name = '  Aria Moonfall  ';
    values.playerName = '   ';
    values.classLabel = '  Battle Master  ';
    values.initiativeBonus = '';
    values.passivePerception = '';
    values.notes = '   ';

    const result = validatePartyMemberForm(values);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toMatchObject({
      name: 'Aria Moonfall',
      classLabel: 'Battle Master',
    });
    expect(result.member).not.toHaveProperty('playerName');
    expect(result.member).not.toHaveProperty('initiativeBonus');
    expect(result.member).not.toHaveProperty('passivePerception');
    expect(result.member).not.toHaveProperty('notes');
  });

  it('omits baseline combat values so class scaling remains live', () => {
    // Level-5 fighter baseline: +7 to hit (prof +3, Str 18) and 11 per hit.
    const normalized = normalizePartyCombatOverrides({
      ac: 18,
      maxHp: 44,
      attackBonus: 7,
      attacksPerRound: 2,
      avgDamagePerHit: 11,
      healingPerRound: 0,
      avgSpellDamagePerRound: 0,
      saveBonuses: { dex: 2, con: 6, wis: 2 },
    }, 'fighter-champion', 5);

    expect(normalized).toBeUndefined();
  });

  it('returns a validated draft without baseline save overrides', () => {
    const values = partyMemberToFormValues({
      name: 'Aria',
      templateId: 'fighter-champion',
      level: 5,
      overrides: {
        saveBonuses: { dex: 2, con: 6, wis: 2 },
      },
    });

    const result = validatePartyMemberForm(values);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).not.toHaveProperty('overrides');
  });

  it('keeps a customized save profile but drops independent baseline fields', () => {
    const normalized = normalizePartyCombatOverrides({
      ac: 18,
      attackBonus: 9,
      saveBonuses: { dex: 2, con: 7, wis: 2 },
    }, 'fighter-champion', 5);

    expect(normalized).toEqual({
      attackBonus: 9,
      saveBonuses: { dex: 2, con: 7, wis: 2 },
    });
  });
});
