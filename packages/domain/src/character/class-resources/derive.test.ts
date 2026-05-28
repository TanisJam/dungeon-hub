/**
 * Tests for deriveClassResources().
 * Covers REQ-RAC-SHAPE (derivation) + REQ-RAC-FIGHTER-SECOND-WIND +
 * REQ-RAC-MONK-KI from sdd/rules-audit-class-features/spec (#814)
 * + REQ-BRD-FND-DERIVE-SIGNATURE from sdd/class-resource-bardic-inspiration/spec (#930).
 */
import { describe, expect, it } from 'vitest';
import type { AppliedClass } from '../class/types.js';
import { deriveClassResources } from './derive.js';
import type { ResourceCtx } from './types.js';

const ZERO_MODS: ResourceCtx['abilityMods'] = {
  str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0,
};

function mods(overrides: Partial<ResourceCtx['abilityMods']> = {}): ResourceCtx['abilityMods'] {
  return { ...ZERO_MODS, ...overrides };
}

const FIGHTER_L1: AppliedClass = {
  slug: 'fighter',
  source: 'PHB',
  level: 1,
  subclass: null,
  hitDie: 'd10',
  savingThrows: ['str', 'con'],
  armorProficiencies: [],
  weaponProficiencies: [],
  toolProficiencies: [],
  skillChoices: [],
};
const MONK_L5: AppliedClass = {
  slug: 'monk',
  source: 'PHB',
  level: 5,
  subclass: null,
  hitDie: 'd8',
  savingThrows: ['str', 'dex'],
  armorProficiencies: [],
  weaponProficiencies: [],
  toolProficiencies: [],
  skillChoices: [],
};
const MONK_L1: AppliedClass = { ...MONK_L5, level: 1 };
const WIZARD_L5: AppliedClass = {
  slug: 'wizard',
  source: 'PHB',
  level: 5,
  subclass: null,
  hitDie: 'd6',
  savingThrows: ['int', 'wis'],
  armorProficiencies: [],
  weaponProficiencies: [],
  toolProficiencies: [],
  skillChoices: [],
};

describe('deriveClassResources — single class', () => {
  it('L1 Fighter → fighter:second-wind only, used 0 / max 1', () => {
    const r = deriveClassResources([FIGHTER_L1], {}, mods());
    expect(Object.keys(r)).toEqual(['fighter:second-wind']);
    expect(r['fighter:second-wind']).toEqual({
      slug: 'fighter:second-wind',
      classSlug: 'fighter',
      used: 0,
      max: 1,
      recoveryTrigger: 'short',
    });
  });

  it('L5 Monk → monk:ki-points only, used 0 / max 5', () => {
    const r = deriveClassResources([MONK_L5], {}, mods());
    expect(Object.keys(r)).toEqual(['monk:ki-points']);
    expect(r['monk:ki-points']?.max).toBe(5);
    expect(r['monk:ki-points']?.used).toBe(0);
  });

  it('L1 Monk → empty map (Ki unlocks at L2)', () => {
    const r = deriveClassResources([MONK_L1], {}, mods());
    expect(r).toEqual({});
  });

  it('L5 Wizard → wizard:arcane-recovery (PHB p.115 L1+)', () => {
    const r = deriveClassResources([WIZARD_L5], {}, mods());
    expect(Object.keys(r)).toEqual(['wizard:arcane-recovery']);
    expect(r['wizard:arcane-recovery']?.max).toBe(1);
  });

  it('does NOT emit `extra` key when def has no extraFor', () => {
    const r = deriveClassResources([FIGHTER_L1], {}, mods());
    expect('extra' in (r['fighter:second-wind'] ?? {})).toBe(false);
  });
});

describe('deriveClassResources — multiclass', () => {
  it('L5 Monk + L1 Fighter → 2 entries with correct max', () => {
    const r = deriveClassResources([MONK_L5, FIGHTER_L1], {}, mods());
    expect(Object.keys(r).sort()).toEqual(['fighter:second-wind', 'monk:ki-points']);
    expect(r['monk:ki-points']?.max).toBe(5);
    expect(r['fighter:second-wind']?.max).toBe(1);
  });
});

describe('deriveClassResources — Bard Bardic Inspiration (PHB p.53-54)', () => {
  const BARD_L1: AppliedClass = {
    slug: 'bard',
    source: 'PHB',
    level: 1,
    subclass: null,
    hitDie: 'd8',
    savingThrows: ['dex', 'cha'],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    skillChoices: [],
  };
  const BARD_L5: AppliedClass = { ...BARD_L1, level: 5 };
  const BARD_L10: AppliedClass = { ...BARD_L1, level: 10 };

  it('Bard L1 CHA +2 → max 2, long-rest trigger, d6 die', () => {
    const r = deriveClassResources([BARD_L1], {}, mods({ cha: 2 }));
    expect(r['bard:bardic-inspiration']).toEqual({
      slug: 'bard:bardic-inspiration',
      classSlug: 'bard',
      used: 0,
      max: 2,
      recoveryTrigger: 'long',
      extra: { dieSize: 'd6' },
    });
  });

  it('Bard L5 CHA +3 → max 3, short-rest trigger (Font of Inspiration), d8 die', () => {
    const r = deriveClassResources([BARD_L5], {}, mods({ cha: 3 }));
    expect(r['bard:bardic-inspiration']).toEqual({
      slug: 'bard:bardic-inspiration',
      classSlug: 'bard',
      used: 0,
      max: 3,
      recoveryTrigger: 'short',
      extra: { dieSize: 'd8' },
    });
  });

  it('Bard L10 CHA +2 → max 2, d10 die', () => {
    const r = deriveClassResources([BARD_L10], {}, mods({ cha: 2 }));
    expect(r['bard:bardic-inspiration']?.max).toBe(2);
    expect(r['bard:bardic-inspiration']?.extra).toEqual({ dieSize: 'd10' });
  });

  it('Bard L1 CHA -1 → max 1 (PHB minimum of once)', () => {
    const r = deriveClassResources([BARD_L1], {}, mods({ cha: -1 }));
    expect(r['bard:bardic-inspiration']?.max).toBe(1);
  });

  it('Bard L1 + Fighter L1 multiclass → both resources; bardic has extra, fighter does not', () => {
    const r = deriveClassResources([BARD_L1, FIGHTER_L1], {}, mods({ cha: 2 }));
    expect(Object.keys(r).sort()).toEqual(['bard:bardic-inspiration', 'fighter:second-wind']);
    expect(r['bard:bardic-inspiration']?.extra).toEqual({ dieSize: 'd6' });
    expect('extra' in (r['fighter:second-wind'] ?? {})).toBe(false);
  });

  it('Bard L1 stored used > max → clamped (read-path tolerance)', () => {
    const r = deriveClassResources(
      [BARD_L1],
      { 'bard:bardic-inspiration': 5 },
      mods({ cha: 2 }),
    );
    expect(r['bard:bardic-inspiration']?.used).toBe(2);
  });
});

describe('deriveClassResources — Paladin Lay on Hands (PHB p.84)', () => {
  const PALADIN_L1: AppliedClass = {
    slug: 'paladin',
    source: 'PHB',
    level: 1,
    subclass: null,
    hitDie: 'd10',
    savingThrows: ['wis', 'cha'],
    armorProficiencies: [],
    weaponProficiencies: [],
    toolProficiencies: [],
    skillChoices: [],
  };
  const PALADIN_L5: AppliedClass = { ...PALADIN_L1, level: 5 };

  it('Paladin L1 → pool 5, long-rest trigger, shape:pool extra', () => {
    const r = deriveClassResources([PALADIN_L1], {}, mods());
    expect(r['paladin:lay-on-hands']).toEqual({
      slug: 'paladin:lay-on-hands',
      classSlug: 'paladin',
      used: 0,
      max: 5,
      recoveryTrigger: 'long',
      extra: { shape: 'pool' },
    });
  });

  it('Paladin L5 stored used 10 → pool 25, used 10', () => {
    const r = deriveClassResources(
      [PALADIN_L5],
      { 'paladin:lay-on-hands': 10 },
      mods(),
    );
    expect(r['paladin:lay-on-hands']?.max).toBe(25);
    expect(r['paladin:lay-on-hands']?.used).toBe(10);
  });

  it('Paladin L5 + Fighter L1 multiclass → lay-on-hands + channel-divinity + second-wind', () => {
    const r = deriveClassResources([PALADIN_L5, FIGHTER_L1], {}, mods());
    expect(Object.keys(r).sort()).toEqual([
      'fighter:second-wind',
      'paladin:channel-divinity',
      'paladin:lay-on-hands',
    ]);
    expect(r['paladin:lay-on-hands']?.max).toBe(25);
    expect(r['paladin:channel-divinity']?.max).toBe(1);
  });

  it('Paladin L5 stored used > max → clamped (read-path tolerance)', () => {
    const r = deriveClassResources(
      [PALADIN_L5],
      { 'paladin:lay-on-hands': 50 },
      mods(),
    );
    expect(r['paladin:lay-on-hands']?.used).toBe(25);
  });
});

describe('deriveClassResources — subclass-gated resources (Druid Natural Recovery)', () => {
  const DRUID_L2_LAND: AppliedClass = {
    slug: 'druid', source: 'PHB', level: 2,
    subclass: { slug: 'druid--circle-of-the-land', source: 'PHB' },
    hitDie: 'd8', savingThrows: ['int', 'wis'],
    armorProficiencies: [], weaponProficiencies: [], toolProficiencies: [], skillChoices: [],
  };
  const DRUID_L2_MOON: AppliedClass = {
    ...DRUID_L2_LAND,
    subclass: { slug: 'druid--circle-of-the-moon', source: 'PHB' },
  };
  const DRUID_L2_NO_SUBCLASS: AppliedClass = { ...DRUID_L2_LAND, subclass: null };

  it('Druid L2 Circle of the Land → natural-recovery emitted', () => {
    const r = deriveClassResources([DRUID_L2_LAND], {}, mods());
    expect(r['druid:natural-recovery']).toBeDefined();
    expect(r['druid:natural-recovery']?.max).toBe(1);
  });

  it('Druid L2 Circle of the Moon → natural-recovery NOT emitted (wrong subclass)', () => {
    const r = deriveClassResources([DRUID_L2_MOON], {}, mods());
    expect(r['druid:natural-recovery']).toBeUndefined();
  });

  it('Druid L2 no subclass → natural-recovery NOT emitted', () => {
    const r = deriveClassResources([DRUID_L2_NO_SUBCLASS], {}, mods());
    expect(r['druid:natural-recovery']).toBeUndefined();
  });
});

describe('deriveClassResources — used counter', () => {
  it('persisted used 3 on L5 Monk → ki used 3', () => {
    const r = deriveClassResources([MONK_L5], { 'monk:ki-points': 3 }, mods());
    expect(r['monk:ki-points']?.used).toBe(3);
  });

  it('persisted used > max → clamped to max (read-path tolerance)', () => {
    // L5 Monk had been L8 at save time → stored ki: 7. After a level-down
    // (rare but possible via DM tooling) the derive layer clamps to current max.
    const r = deriveClassResources([MONK_L5], { 'monk:ki-points': 7 }, mods());
    expect(r['monk:ki-points']?.used).toBe(5);
  });

  it('persisted used for a resource of a class the char does NOT have is ignored', () => {
    // Stored slug for fighter resource on a Wizard-only character (legacy data).
    // Wizard owns arcane-recovery so the wizard slot derives normally; the stored
    // fighter-second-wind entry is silently ignored.
    const r = deriveClassResources([WIZARD_L5], { 'fighter:second-wind': 1 }, mods());
    expect(Object.keys(r)).toEqual(['wizard:arcane-recovery']);
    expect(r['fighter:second-wind']).toBeUndefined();
  });
});
