/**
 * Form-switching subsystem tests.
 *
 * // PHB 66-67: Wild Shape stat substitution + retention + max(self,beast) policy.
 * PHB 66: "Your game statistics are replaced by the statistics of the beast,
 *  but you retain your alignment, personality, and... your Intelligence, Wisdom,
 *  and Charisma scores..."
 * PHB 66: "You also retain all of your skill and saving throw proficiencies, in
 *  addition to gaining those of the creature. If the creature has the same
 *  proficiency in a skill or saving throw... you use whichever bonus is higher."
 */
import { describe, it, expect } from 'vitest';
import { applyFormSwitch } from './substitute.js';
import type { StatKey } from '../types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A minimal beast stat block for test purposes. */
const WOLF_BLOCK = {
  str: 18,
  dex: 15,
  con: 14,
  int: 3,
  wis: 12,
  cha: 7,
  'skill.perception': 3,
};

/** Self character stats. */
const SELF_STATS = {
  str: 10,
  dex: 12,
  con: 13,
  int: 14,
  wis: 11,
  cha: 16,
  'skill.perception': 5, // self perception > beast
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('applyFormSwitch — ReplaceMod substitution', () => {
  it('substitutes STR with beast value when stat is physical and not in retain list', () => {
    // PHB 66: physical stats (STR/DEX/CON) replaced by beast stats
    const result = applyFormSwitch({
      selfStats: SELF_STATS,
      beastStats: WOLF_BLOCK,
      stat: 'str',
      retain: ['int', 'wis', 'cha'],
    });

    expect(result.value).toBe(18);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]!.label).toBe('Wild Shape (beast form)');
    expect(result.breakdown[0]!.type).toBe('ReplaceMod');
    expect(result.breakdown[0]!.amount).toBe(18);
  });

  it('retains INT from self when stat is in the retain list', () => {
    // PHB 66: INT/WIS/CHA retained from self
    const result = applyFormSwitch({
      selfStats: SELF_STATS,
      beastStats: WOLF_BLOCK,
      stat: 'int',
      retain: ['int', 'wis', 'cha'],
    });

    expect(result.value).toBe(14); // self INT=14, beast INT=3 → retain self
    expect(result.breakdown[0]!.label).toContain('retained');
    expect(result.breakdown[0]!.type).toBe('retain');
  });

  it('applies max(self,beast) policy for skill.perception when self bonus is higher', () => {
    // PHB 66: "whichever bonus is higher" for overlapping proficiencies
    const result = applyFormSwitch({
      selfStats: SELF_STATS,
      beastStats: WOLF_BLOCK,
      stat: 'skill.perception',
      retain: ['int', 'wis', 'cha'],
      policy: 'max-self-beast',
    });

    expect(result.value).toBe(5); // max(self=5, beast=3) = 5
    expect(result.breakdown).toHaveLength(2);
    // Both sources listed for traceability
    const labels = result.breakdown.map((s) => s.label);
    expect(labels.some((l) => l.includes('self'))).toBe(true);
    expect(labels.some((l) => l.includes('beast'))).toBe(true);
  });

  it('returns gmRuling passthrough for equipment stat queries', () => {
    // PHB 66: equipment handling is DM-discretion
    const result = applyFormSwitch({
      selfStats: SELF_STATS,
      beastStats: WOLF_BLOCK,
      stat: 'str' as StatKey,
      retain: ['int', 'wis', 'cha'],
      gmRuling: true,
    });

    expect(result.gmRuling).toBe(true);
    expect(result.description).toContain('DM-discretion');
  });
});
