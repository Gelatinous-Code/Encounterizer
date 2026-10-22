import { describe, expect, it } from 'vitest';
import {
  buildSimPlayer,
  CLASS_TEMPLATES,
  computeHp,
  defaultPartyConfig,
  getTemplateById,
  syncPartyConfigMembers,
  templateStatsForLevel,
  tierForLevel,
  type LevelTier,
} from '@/data/class-templates';

const TIERS: LevelTier[] = ['1-4', '5-10', '11-16', '17-20'];
const REPRESENTATIVE_LEVEL: Record<LevelTier, number> = { '1-4': 3, '5-10': 8, '11-16': 13, '17-20': 18 };

describe('CLASS_TEMPLATES', () => {
  it('covers all fifteen classes from the spec', () => {
    expect(CLASS_TEMPLATES).toHaveLength(15);
    expect(new Set(CLASS_TEMPLATES.map((t) => t.id)).size).toBe(15);
  });

  it.each(CLASS_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s has monotonically non-decreasing combat stats across tiers',
    (_name, template) => {
      for (let i = 1; i < TIERS.length; i++) {
        const prev = template.tiers[TIERS[i - 1]];
        const curr = template.tiers[TIERS[i]];
        expect(curr.ac).toBeGreaterThanOrEqual(prev.ac);
        expect(curr.attackBonus).toBeGreaterThan(prev.attackBonus);
        expect(curr.attacksPerRound).toBeGreaterThanOrEqual(prev.attacksPerRound);
        expect(curr.avgDamagePerHit).toBeGreaterThanOrEqual(prev.avgDamagePerHit);
        expect(curr.saveBonuses.dex + curr.saveBonuses.con + curr.saveBonuses.wis)
          .toBeGreaterThanOrEqual(prev.saveBonuses.dex + prev.saveBonuses.con + prev.saveBonuses.wis);
      }
    },
  );

  it.each(CLASS_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s expected DPR stays inside a sane band per tier',
    (_name, template) => {
      // Nominal 65% hit rate, 70% average spell effect.
      const bands: Record<LevelTier, [number, number]> = {
        '1-4': [3, 30],
        '5-10': [8, 50],
        '11-16': [12, 75],
        '17-20': [15, 100],
      };
      for (const tier of TIERS) {
        const stats = template.tiers[tier];
        const dpr =
          stats.attacksPerRound * stats.avgDamagePerHit * 0.65
          + (stats.avgSpellDamagePerRound ?? 0) * 0.7
          + (stats.special?.sneakDamage ?? 0) * 0.65;
        const [min, max] = bands[tier];
        expect(dpr, `${template.id} ${tier} dpr=${dpr.toFixed(1)}`).toBeGreaterThanOrEqual(min);
        expect(dpr, `${template.id} ${tier} dpr=${dpr.toFixed(1)}`).toBeLessThanOrEqual(max);
      }
    },
  );

  it('healers heal and ragers rage', () => {
    expect(CLASS_TEMPLATES.find((t) => t.id === 'cleric-life')!.tiers['5-10'].healingPerRound).toBeGreaterThan(0);
    expect(CLASS_TEMPLATES.find((t) => t.id === 'barbarian-berserker')!.tiers['1-4'].special?.rage).toBe(true);
    expect(CLASS_TEMPLATES.find((t) => t.id === 'rogue-thief')!.tiers['5-10'].special?.evasion).toBe(true);
  });
});

describe('tierForLevel / computeHp', () => {
  it('maps levels to tiers at the boundaries', () => {
    expect(tierForLevel(1)).toBe('1-4');
    expect(tierForLevel(4)).toBe('1-4');
    expect(tierForLevel(5)).toBe('5-10');
    expect(tierForLevel(10)).toBe('5-10');
    expect(tierForLevel(11)).toBe('11-16');
    expect(tierForLevel(17)).toBe('17-20');
  });

  it('computes 2024 fixed-average HP', () => {
    // Level 1 fighter, +2 con: 10 + 2 = 12
    expect(computeHp(10, 2, 1)).toBe(12);
    // Level 8 fighter, +2 con: 12 + 7 × 8 = 68
    expect(computeHp(10, 2, 8)).toBe(68);
    // Level 8 wizard, +2 con: 8 + 7 × 6 = 50
    expect(computeHp(6, 2, 8)).toBe(50);
  });
});

describe('templateStatsForLevel', () => {
  it.each(CLASS_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s returns each tier row unchanged at its representative level',
    (_name, template) => {
      for (const tier of TIERS) {
        expect(templateStatsForLevel(template, REPRESENTATIVE_LEVEL[tier])).toEqual(template.tiers[tier]);
      }
    },
  );

  it('keeps level-8 forecast players identical to the 5-10 tier row', () => {
    for (const template of CLASS_TEMPLATES) {
      const row = template.tiers['5-10'];
      const player = buildSimPlayer({ name: 'T', templateId: template.id, level: 8 }, 0);
      expect(player.attackBonus, template.id).toBe(row.attackBonus);
      expect(player.avgDamagePerHit, template.id).toBe(row.avgDamagePerHit);
      expect(player.spellDc, template.id).toBe(row.spellDc);
      expect(player.avgSpellDamagePerRound, template.id).toBe(row.avgSpellDamagePerRound);
      expect(player.healingPerRound, template.id).toBe(row.healingPerRound);
      expect(player.special?.sneakDamage, template.id).toBe(row.special?.sneakDamage);
    }
  });

  it('follows the 2024 proficiency and ability-score progression for attacks', () => {
    const fighter = getTemplateById('fighter-champion')!;
    expect([1, 4, 5, 8, 9, 13, 17].map((level) => templateStatsForLevel(fighter, level).attackBonus))
      .toEqual([5, 6, 7, 8, 9, 10, 11]);
    // Level 5 fighters haven't taken the level-8 ASI yet.
    expect(templateStatsForLevel(fighter, 5).avgDamagePerHit).toBe(11);
  });

  it('scales Sneak Attack as ⌈level ÷ 2⌉d6 and Rage by its own table', () => {
    const rogue = getTemplateById('rogue-thief')!;
    expect(templateStatsForLevel(rogue, 5).special?.sneakDamage).toBe(10); // 3d6
    expect(templateStatsForLevel(rogue, 10).special?.sneakDamage).toBe(17); // 5d6
    const barbarian = getTemplateById('barbarian-berserker')!;
    expect(templateStatsForLevel(barbarian, 9).avgDamagePerHit).toBe(15); // Rage +3 at 9
  });

  it('caps the casting modifier where the template\'s level-8 row does', () => {
    const wizard = getTemplateById('wizard-evoker')!;
    const cleric = getTemplateById('cleric-life')!;
    expect([5, 8, 9].map((level) => templateStatsForLevel(wizard, level).spellDc)).toEqual([15, 16, 17]);
    expect([5, 8, 9].map((level) => templateStatsForLevel(cleric, level).spellDc)).toEqual([15, 15, 16]);
  });

  it('moves leveled-spell damage and healing with the highest spell slot', () => {
    const wizard = getTemplateById('wizard-evoker')!;
    expect(templateStatsForLevel(wizard, 5).avgSpellDamagePerRound).toBe(12); // 3rd-level slots
    expect(templateStatsForLevel(wizard, 9).avgSpellDamagePerRound).toBe(18.7); // 5th-level slots
    const cleric = getTemplateById('cleric-life')!;
    expect(templateStatsForLevel(cleric, 5).healingPerRound).toBe(6.5);
  });

  it.each(CLASS_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s expected DPR never drops from one level to the next',
    (_name, template) => {
      let prev = 0;
      for (let level = 1; level <= 20; level++) {
        const stats = templateStatsForLevel(template, level);
        const hit = Math.min(0.95, Math.max(0.05, (21 + stats.attackBonus - 15) / 20));
        const dpr = stats.attacksPerRound * stats.avgDamagePerHit * hit
          + (stats.avgSpellDamagePerRound ?? 0) * 0.7
          + (stats.special?.sneakDamage ?? 0) * hit;
        expect(dpr, `${template.id} L${level} dpr=${dpr.toFixed(2)}`).toBeGreaterThanOrEqual(prev);
        prev = dpr;
      }
    },
  );

  it('gives a level-5 party less offense than level 8, and a level-10 party more', () => {
    const partyDamage = (level: number) => defaultPartyConfig(4, level)
      .map((config, index) => buildSimPlayer(config, index))
      .reduce((sum, p) => sum
        + p.attacksPerRound * p.avgDamagePerHit
        + (p.avgSpellDamagePerRound ?? 0)
        + (p.special?.sneakDamage ?? 0), 0);
    expect(partyDamage(5)).toBeLessThan(partyDamage(8));
    expect(partyDamage(10)).toBeGreaterThan(partyDamage(8));
  });
});

describe('buildSimPlayer', () => {
  it('HP grows strictly with level for every template', () => {
    for (const template of CLASS_TEMPLATES) {
      let prev = 0;
      for (let level = 1; level <= 20; level++) {
        const player = buildSimPlayer({ name: 'T', templateId: template.id, level }, 0);
        expect(player.maxHp, `${template.id} L${level}`).toBeGreaterThan(prev);
        prev = player.maxHp;
      }
    }
  });

  it('applies overrides on top of template values', () => {
    const player = buildSimPlayer(
      { name: 'Tanky', templateId: 'wizard-evoker', level: 8, overrides: { ac: 20, maxHp: 99 } },
      0,
    );
    expect(player.ac).toBe(20);
    expect(player.maxHp).toBe(99);
    expect(player.spellDc).toBe(16); // non-overridden template value intact
  });

  it('falls back to the first template for unknown ids and clamps level', () => {
    const player = buildSimPlayer({ name: 'X', templateId: 'nope', level: 99 }, 0);
    expect(player.templateId).toBe('fighter-champion');
    expect(player.level).toBe(20);
  });
});

describe('defaultPartyConfig', () => {
  it('rotates through the classic four-role party', () => {
    const config = defaultPartyConfig(5, 3);
    expect(config).toHaveLength(5);
    expect(config.map((c) => c.templateId)).toEqual([
      'fighter-champion', 'cleric-life', 'rogue-thief', 'wizard-evoker', 'fighter-champion',
    ]);
    expect(config.every((c) => c.level === 3)).toBe(true);
  });

  it('synchronizes size and level without discarding DM customizations', () => {
    const members = [
      {
        name: 'Aria',
        templateId: 'wizard-evoker',
        level: 3,
        overrides: { ac: 17 },
      },
    ];

    const synced = syncPartyConfigMembers(members, 3, 8);

    expect(synced).toHaveLength(3);
    expect(synced[0]).toEqual({
      name: 'Aria',
      templateId: 'wizard-evoker',
      level: 8,
      overrides: { ac: 17 },
    });
    expect(synced.slice(1).every((member) => member.level === 8)).toBe(true);
  });
});
