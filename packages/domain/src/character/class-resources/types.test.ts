/**
 * Tests for ClassResource shape.
 * Covers REQ-RAC-SHAPE from sdd/rules-audit-class-features/spec (#814).
 */
import { describe, expect, it } from 'vitest';
import type { ClassResource, ClassResourceDef, RecoveryTrigger } from './types.js';

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
  it('accepts a definition with a level-based formula', () => {
    const def: ClassResourceDef = {
      slug: 'monk:ki-points',
      classSlug: 'monk',
      recoveryTrigger: 'short',
      maxFor: (lv) => (lv >= 2 ? lv : null),
    };
    expect(def.maxFor(1)).toBeNull();
    expect(def.maxFor(5)).toBe(5);
  });
});

describe('RecoveryTrigger — union', () => {
  it('admits short, long, and both as trigger values', () => {
    const triggers: RecoveryTrigger[] = ['short', 'long', 'both'];
    expect(triggers).toHaveLength(3);
  });
});
