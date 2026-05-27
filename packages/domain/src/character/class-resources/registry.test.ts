/**
 * Tests for CLASS_RESOURCES registry + classResourceBySlug() lookup.
 * Covers REQ-RAC-FIGHTER-SECOND-WIND and REQ-RAC-MONK-KI from
 * sdd/rules-audit-class-features/spec (#814).
 *
 * PHB anchors: Second Wind p.72; Ki p.78.
 */
import { describe, expect, it } from 'vitest';
import { CLASS_RESOURCES, classResourceBySlug } from './registry.js';
import type { ResourceCtx } from './types.js';

const ZERO_MODS: ResourceCtx['abilityMods'] = {
  str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0,
};

function ctx(classLevel: number, modOverrides: Partial<ResourceCtx['abilityMods']> = {}): ResourceCtx {
  return { classLevel, abilityMods: { ...ZERO_MODS, ...modOverrides } };
}

describe('CLASS_RESOURCES — Fighter Second Wind (PHB p.72)', () => {
  it('L1 Fighter → max 1 + short rest', () => {
    const def = classResourceBySlug('fighter:second-wind');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.classSlug).toBe('fighter');
    expect(def.recoveryTriggerFor(ctx(1))).toBe('short');
    expect(def.maxFor(ctx(1))).toBe(1);
  });

  it('L20 Fighter still has max 1 (no scaling per PHB p.72)', () => {
    const def = classResourceBySlug('fighter:second-wind');
    if (!def) throw new Error('fighter:second-wind missing');
    expect(def.maxFor(ctx(20))).toBe(1);
  });

  it('L0 Fighter (i.e. not a fighter) → null (not unlocked)', () => {
    const def = classResourceBySlug('fighter:second-wind');
    if (!def) throw new Error('fighter:second-wind missing');
    expect(def.maxFor(ctx(0))).toBeNull();
  });
});

describe('CLASS_RESOURCES — Monk Ki (PHB p.78)', () => {
  it('L1 Monk → null (Ki unlocks at L2)', () => {
    const def = classResourceBySlug('monk:ki-points');
    if (!def) throw new Error('monk:ki-points missing');
    expect(def.maxFor(ctx(1))).toBeNull();
  });

  it('L2 Monk → max 2 + short rest', () => {
    const def = classResourceBySlug('monk:ki-points');
    if (!def) throw new Error('monk:ki-points missing');
    expect(def.classSlug).toBe('monk');
    expect(def.recoveryTriggerFor(ctx(2))).toBe('short');
    expect(def.maxFor(ctx(2))).toBe(2);
  });

  it('L5 Monk → max 5 (max = monk level)', () => {
    const def = classResourceBySlug('monk:ki-points');
    if (!def) throw new Error('monk:ki-points missing');
    expect(def.maxFor(ctx(5))).toBe(5);
  });

  it('L20 Monk → max 20', () => {
    const def = classResourceBySlug('monk:ki-points');
    if (!def) throw new Error('monk:ki-points missing');
    expect(def.maxFor(ctx(20))).toBe(20);
  });
});

describe('CLASS_RESOURCES — Bard Bardic Inspiration (PHB p.53-54)', () => {
  // PHB p.53: "a number of times equal to your Charisma modifier (a minimum of once)"
  it('L1 Bard with CHA mod -1 → max 1 (PHB p.53 minimum of once)', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.maxFor(ctx(1, { cha: -1 }))).toBe(1);
  });

  it('L1 Bard with CHA mod 0 → max 1', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.maxFor(ctx(1, { cha: 0 }))).toBe(1);
  });

  it('L1 Bard with CHA mod 3 → max 3', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.maxFor(ctx(1, { cha: 3 }))).toBe(3);
  });

  it('L0 Bard → null (not unlocked)', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.maxFor(ctx(0, { cha: 5 }))).toBeNull();
  });

  // PHB p.54 Font of Inspiration at L5: short or long rest restores
  it('L4 Bard → recovery trigger "long" (pre Font of Inspiration)', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.recoveryTriggerFor(ctx(4, { cha: 2 }))).toBe('long');
  });

  it('L5 Bard → recovery trigger "short" (Font of Inspiration)', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.recoveryTriggerFor(ctx(5, { cha: 2 }))).toBe('short');
  });

  it('L20 Bard → recovery trigger "short"', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.recoveryTriggerFor(ctx(20, { cha: 5 }))).toBe('short');
  });

  // PHB p.54 Bard table — Bardic Inspiration Die column
  it.each([
    [1, 'd6'], [4, 'd6'],
    [5, 'd8'], [9, 'd8'],
    [10, 'd10'], [14, 'd10'],
    [15, 'd12'], [20, 'd12'],
  ])('L%i Bard → extra.dieSize = %s (PHB p.54 table)', (lvl, expected) => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.extraFor?.(ctx(lvl, { cha: 2 }))).toEqual({ dieSize: expected });
  });

  it('L0 Bard → extraFor returns undefined', () => {
    const def = classResourceBySlug('bard:bardic-inspiration');
    if (!def) throw new Error('bard:bardic-inspiration missing');
    expect(def.extraFor?.(ctx(0, { cha: 2 }))).toBeUndefined();
  });
});

describe('CLASS_RESOURCES — Paladin Lay on Hands (PHB p.84)', () => {
  // PHB p.84: "a pool of healing power that replenishes when you take a long rest.
  // With that pool, you can restore a total number of hit points equal to your
  // paladin level × 5."
  it('L0 Paladin → maxFor null (not unlocked)', () => {
    const def = classResourceBySlug('paladin:lay-on-hands');
    if (!def) throw new Error('paladin:lay-on-hands missing');
    expect(def.maxFor(ctx(0))).toBeNull();
  });

  it('L1 Paladin → pool 5', () => {
    const def = classResourceBySlug('paladin:lay-on-hands');
    if (!def) throw new Error('paladin:lay-on-hands missing');
    expect(def.classSlug).toBe('paladin');
    expect(def.maxFor(ctx(1))).toBe(5);
  });

  it('L5 Paladin → pool 25', () => {
    const def = classResourceBySlug('paladin:lay-on-hands');
    if (!def) throw new Error('paladin:lay-on-hands missing');
    expect(def.maxFor(ctx(5))).toBe(25);
  });

  it('L20 Paladin → pool 100', () => {
    const def = classResourceBySlug('paladin:lay-on-hands');
    if (!def) throw new Error('paladin:lay-on-hands missing');
    expect(def.maxFor(ctx(20))).toBe(100);
  });

  it('any Paladin level → recovery trigger "long" (PHB p.84 long rest only)', () => {
    const def = classResourceBySlug('paladin:lay-on-hands');
    if (!def) throw new Error('paladin:lay-on-hands missing');
    expect(def.recoveryTriggerFor(ctx(1))).toBe('long');
    expect(def.recoveryTriggerFor(ctx(20))).toBe('long');
  });

  it('L1 Paladin → extraFor returns { shape: "pool" }', () => {
    const def = classResourceBySlug('paladin:lay-on-hands');
    if (!def) throw new Error('paladin:lay-on-hands missing');
    expect(def.extraFor?.(ctx(1))).toEqual({ shape: 'pool' });
  });

  it('L0 Paladin → extraFor returns undefined', () => {
    const def = classResourceBySlug('paladin:lay-on-hands');
    if (!def) throw new Error('paladin:lay-on-hands missing');
    expect(def.extraFor?.(ctx(0))).toBeUndefined();
  });
});

describe('CLASS_RESOURCES — Fighter Indomitable (PHB p.72)', () => {
  // PHB p.72: 1 use at L9, 2 at L13, 3 at L17; recovers on long rest.
  it.each([
    [8, null], [9, 1], [12, 1], [13, 2], [16, 2], [17, 3], [20, 3],
  ])('L%i Fighter → max %s', (lvl, expected) => {
    const def = classResourceBySlug('fighter:indomitable');
    if (!def) throw new Error('fighter:indomitable missing');
    expect(def.maxFor(ctx(lvl))).toBe(expected);
  });

  it('recovery trigger is "long"', () => {
    const def = classResourceBySlug('fighter:indomitable');
    if (!def) throw new Error('fighter:indomitable missing');
    expect(def.recoveryTriggerFor(ctx(9))).toBe('long');
  });
});

describe('CLASS_RESOURCES — Cleric Channel Divinity (PHB p.59)', () => {
  // PHB p.59: 1 at L2, 2 at L6, 3 at L18; short or long rest.
  it.each([
    [1, null], [2, 1], [5, 1], [6, 2], [17, 2], [18, 3], [20, 3],
  ])('L%i Cleric → max %s', (lvl, expected) => {
    const def = classResourceBySlug('cleric:channel-divinity');
    if (!def) throw new Error('cleric:channel-divinity missing');
    expect(def.maxFor(ctx(lvl))).toBe(expected);
  });

  it('recovery trigger is "short" (covers both rests per PHB)', () => {
    const def = classResourceBySlug('cleric:channel-divinity');
    if (!def) throw new Error('cleric:channel-divinity missing');
    expect(def.recoveryTriggerFor(ctx(2))).toBe('short');
  });
});

describe('CLASS_RESOURCES — Paladin Channel Divinity (PHB p.85)', () => {
  // PHB p.85: 1 at L3, 2 at L11.
  it.each([
    [2, null], [3, 1], [10, 1], [11, 2], [20, 2],
  ])('L%i Paladin → max %s', (lvl, expected) => {
    const def = classResourceBySlug('paladin:channel-divinity');
    if (!def) throw new Error('paladin:channel-divinity missing');
    expect(def.maxFor(ctx(lvl))).toBe(expected);
  });
});

describe('CLASS_RESOURCES — Wizard Arcane Recovery (PHB p.115)', () => {
  // PHB p.115: 1 use, recovers on long rest.
  it('L0 Wizard → null; L1+ → max 1', () => {
    const def = classResourceBySlug('wizard:arcane-recovery');
    if (!def) throw new Error('wizard:arcane-recovery missing');
    expect(def.maxFor(ctx(0))).toBeNull();
    expect(def.maxFor(ctx(1))).toBe(1);
    expect(def.maxFor(ctx(20))).toBe(1);
  });

  it('recovery trigger is "long"', () => {
    const def = classResourceBySlug('wizard:arcane-recovery');
    if (!def) throw new Error('wizard:arcane-recovery missing');
    expect(def.recoveryTriggerFor(ctx(1))).toBe('long');
  });
});

describe('CLASS_RESOURCES — Sorcerer Sorcery Points (PHB p.101)', () => {
  // PHB p.101: max = sorcerer level; recovers on long rest; unlocks at L2.
  it.each([
    [1, null], [2, 2], [10, 10], [20, 20],
  ])('L%i Sorcerer → max %s', (lvl, expected) => {
    const def = classResourceBySlug('sorcerer:sorcery-points');
    if (!def) throw new Error('sorcerer:sorcery-points missing');
    expect(def.maxFor(ctx(lvl))).toBe(expected);
  });

  it('recovery trigger is "long"', () => {
    const def = classResourceBySlug('sorcerer:sorcery-points');
    if (!def) throw new Error('sorcerer:sorcery-points missing');
    expect(def.recoveryTriggerFor(ctx(2))).toBe('long');
  });
});

describe('CLASS_RESOURCES — Druid Natural Recovery (PHB p.68, subclass-gated)', () => {
  // PHB p.68: Circle of the Land L2+, 1 use, long rest.
  it('def declares subclassSlug = druid--circle-of-the-land', () => {
    const def = classResourceBySlug('druid:natural-recovery');
    if (!def) throw new Error('druid:natural-recovery missing');
    expect(def.subclassSlug).toBe('druid--circle-of-the-land');
  });

  it('L1 Druid → null; L2+ → max 1', () => {
    const def = classResourceBySlug('druid:natural-recovery');
    if (!def) throw new Error('druid:natural-recovery missing');
    expect(def.maxFor(ctx(1))).toBeNull();
    expect(def.maxFor(ctx(2))).toBe(1);
    expect(def.maxFor(ctx(20))).toBe(1);
  });

  it('recovery trigger is "long"', () => {
    const def = classResourceBySlug('druid:natural-recovery');
    if (!def) throw new Error('druid:natural-recovery missing');
    expect(def.recoveryTriggerFor(ctx(2))).toBe('long');
  });
});

describe('classResourceBySlug — lookup', () => {
  it('returns undefined for unknown slug', () => {
    expect(classResourceBySlug('monk:bogus')).toBeUndefined();
    expect(classResourceBySlug('fighter:nonexistent')).toBeUndefined();
  });

  it('CLASS_RESOURCES contains all R-07 entries (10 total)', () => {
    const slugs = CLASS_RESOURCES.map((d) => d.slug).sort();
    expect(slugs).toEqual([
      'bard:bardic-inspiration',
      'cleric:channel-divinity',
      'druid:natural-recovery',
      'fighter:indomitable',
      'fighter:second-wind',
      'monk:ki-points',
      'paladin:channel-divinity',
      'paladin:lay-on-hands',
      'sorcerer:sorcery-points',
      'wizard:arcane-recovery',
    ]);
  });
});
