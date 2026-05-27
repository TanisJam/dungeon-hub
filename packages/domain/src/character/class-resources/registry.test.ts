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

describe('classResourceBySlug — lookup', () => {
  it('returns undefined for unknown slug', () => {
    expect(classResourceBySlug('monk:bogus')).toBeUndefined();
    expect(classResourceBySlug('fighter:nonexistent')).toBeUndefined();
  });

  it('CLASS_RESOURCES contains the three canonical entries', () => {
    const slugs = CLASS_RESOURCES.map((d) => d.slug).sort();
    expect(slugs).toEqual(['bard:bardic-inspiration', 'fighter:second-wind', 'monk:ki-points']);
  });
});
