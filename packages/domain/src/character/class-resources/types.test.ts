/**
 * Tests for ClassResource shape.
 * Covers REQ-RAC-SHAPE from sdd/rules-audit-class-features/spec (#814)
 * + REQ-BRD-FND-RESOURCE-CTX from sdd/class-resource-bardic-inspiration/spec (#930).
 */
import { describe, expect, it } from 'vitest';
import type { ClassResource, ClassResourceDef, RecoveryTrigger, ResourceCtx } from './types.js';

const ZERO_MODS: ResourceCtx['abilityMods'] = {
  str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0,
};

describe('ClassResource — shape', () => {
  it('accepts a well-formed instance', () => {
    const r: ClassResource = {
      slug: 'fighter:second-wind',
      classSlug: 'fighter',
      used: 0,
      max: 1,
      recoveryTrigger: 'short',
    };
    expect(r.slug).toBe('fighter:second-wind');
    expect(r.max).toBe(1);
  });

  it('allows optional extra metadata for forward-compat (Bardic die, Lay-on-Hands pool)', () => {
    const r: ClassResource = {
      slug: 'bard:bardic-inspiration',
      classSlug: 'bard',
      used: 0,
      max: 3,
      recoveryTrigger: 'long',
      extra: { dieSize: 'd6' },
    };
    expect(r.extra).toEqual({ dieSize: 'd6' });
  });
});

describe('ClassResourceDef — shape', () => {
  it('accepts a definition with ctx-based callbacks', () => {
    const def: ClassResourceDef = {
      slug: 'monk:ki-points',
      classSlug: 'monk',
      maxFor: ({ classLevel }) => (classLevel >= 2 ? classLevel : null),
      recoveryTriggerFor: () => 'short',
    };
    expect(def.maxFor({ classLevel: 1, abilityMods: ZERO_MODS })).toBeNull();
    expect(def.maxFor({ classLevel: 5, abilityMods: ZERO_MODS })).toBe(5);
    expect(def.recoveryTriggerFor({ classLevel: 5, abilityMods: ZERO_MODS })).toBe('short');
  });

  it('optionally declares extraFor for dynamic per-level payloads', () => {
    const def: ClassResourceDef = {
      slug: 'sample:thing',
      classSlug: 'sample',
      maxFor: () => 1,
      recoveryTriggerFor: () => 'long',
      extraFor: ({ classLevel }) => ({ hint: `lvl-${classLevel}` }),
    };
    expect(def.extraFor?.({ classLevel: 3, abilityMods: ZERO_MODS })).toEqual({ hint: 'lvl-3' });
  });
});

describe('RecoveryTrigger — union', () => {
  it('admits short, long, and both as trigger values', () => {
    const triggers: RecoveryTrigger[] = ['short', 'long', 'both'];
    expect(triggers).toHaveLength(3);
  });
});
