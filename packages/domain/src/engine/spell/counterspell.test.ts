/**
 * TDD tests — engine-counterspell (Front #4 Slice 1)
 *
 * Covers:
 *   - REQ-CS-01: resolveCounterspell auto-counter branch (PHB p.281)
 *   - REQ-CS-02: resolveCounterspell DC-check branch (PHB p.281)
 *
 * Strict TDD — tests written RED first, each RED→GREEN cycle documented.
 *
 * PHB p.281 — Counterspell:
 *   "When you cast this spell, you attempt to interrupt a creature in the process
 *    of casting a spell. If the creature is casting a spell of 3rd level or lower,
 *    its spell fails and has no effect. If it is casting a spell of 4th level or
 *    higher, make an ability check using your spellcasting ability. The DC equals
 *    10 + the spell's level. On a success, the creature's spell fails and has no
 *    effect."
 *
 *   At Higher Levels: "When you cast this spell using a spell slot of 4th level or
 *    higher, the interrupted spell has no effect if its level is less than or equal
 *    to the level of the spell slot you used."
 */
import { describe, it, expect } from 'vitest';
import { resolveCounterspell } from './counterspell.js';
import type { RngFn } from '../dice/roll.js';

// ── Cycle 1 — Auto-counter: level ≤ slot (REQ-CS-01) ─────────────────────────

describe('resolveCounterspell — auto-counter branch (REQ-CS-01)', () => {
  it('3rd-slot auto-counters 1st-level spell (PHB p.281)', () => {
    // PHB p.281: "If the creature is casting a spell of 3rd level or lower, its
    // spell fails and has no effect." — default Counterspell (3rd slot counters ≤3).
    // Here: counteredSpellLevel 1 ≤ counterspellSlotLevel 3 → auto-success.
    const rng: RngFn = () => {
      throw new Error('rng must not be called on auto-success');
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 1,
      counterspellSlotLevel: 3,
      counterspellerAbilityMod: 0,
      rng,
    });
    expect(result.countered).toBe(true);
    expect(result.autoSuccess).toBe(true);
    expect('check' in result).toBe(false); // exactOptionalPropertyTypes: key must be absent
  });

  it('equal-slot boundary: level 3 == slot 3 → auto-counter (PHB p.281)', () => {
    // PHB p.281 base text: spell of "3rd level or lower" fails automatically
    // when cast against a 3rd-level Counterspell. Equal slot = auto.
    const rng: RngFn = () => {
      throw new Error('rng must not be called on auto-success');
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 3,
      counterspellSlotLevel: 3,
      counterspellerAbilityMod: 2,
      rng,
    });
    expect(result.countered).toBe(true);
    expect(result.autoSuccess).toBe(true);
    expect('check' in result).toBe(false);
  });

  it('upcast threshold: slot 4 auto-counters level 4 spell (PHB p.281 At Higher Levels)', () => {
    // PHB p.281 At Higher Levels: "the interrupted spell has no effect if its level
    // is less than or equal to the level of the spell slot you used."
    // Slot 4 → auto-counters anything ≤4, including a 4th-level spell.
    const rng: RngFn = () => {
      throw new Error('rng must not be called on auto-success');
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 4,
      counterspellSlotLevel: 4,
      counterspellerAbilityMod: 3,
      rng,
    });
    expect(result.countered).toBe(true);
    expect(result.autoSuccess).toBe(true);
    expect('check' in result).toBe(false);
  });

  it('slot 5 auto-counters level 5 spell (upcast threshold — PHB p.281 At Higher Levels)', () => {
    // Slot 5 expands threshold: auto-counters anything ≤5 including level 5.
    const rng: RngFn = () => {
      throw new Error('rng must not be called on auto-success');
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 5,
      counterspellSlotLevel: 5,
      counterspellerAbilityMod: 2,
      rng,
    });
    expect(result.countered).toBe(true);
    expect(result.autoSuccess).toBe(true);
    expect('check' in result).toBe(false);
  });
});

// ── Cycle 2 — DC-check PASS (REQ-CS-02) ──────────────────────────────────────

describe('resolveCounterspell — DC-check PASS (REQ-CS-02)', () => {
  it('level 5 > slot 3, mod +3, planted d20=14 → total 17 ≥ DC 15 → countered (PHB p.281)', () => {
    // PHB p.281: "make an ability check using your spellcasting ability.
    // The DC equals 10 + the spell's level." DC = 10 + 5 = 15.
    // d20=14, mod=+3, total=17 ≥ 15 → countered=true, autoSuccess=false.
    let calls = 0;
    const seededRng: RngFn = (sides) => {
      expect(sides).toBe(20); // must be a d20 roll
      calls++;
      return 14; // planted value
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 5,
      counterspellSlotLevel: 3,
      counterspellerAbilityMod: 3,
      rng: seededRng,
    });
    expect(calls).toBe(1); // exactly one d20
    expect(result.countered).toBe(true);
    expect(result.autoSuccess).toBe(false);
    // Narrow to DC-check arm before accessing .check (exactOptionalPropertyTypes)
    if (result.autoSuccess !== false) throw new Error('expected DC-check arm');
    expect(result.check.dc).toBe(15);
    expect(result.check.d20).toBe(14);
    expect(result.check.total).toBe(17);
  });
});

// ── Cycle 3 — DC-check FAIL (REQ-CS-02) ──────────────────────────────────────

describe('resolveCounterspell — DC-check FAIL (REQ-CS-02)', () => {
  it('level 5 > slot 3, mod +0, planted d20=4 → total 4 < DC 15 → not countered (PHB p.281)', () => {
    // PHB p.281: DC = 10 + 5 = 15. d20=4, mod=0, total=4 < 15 → countered=false.
    let calls = 0;
    const seededRng: RngFn = (sides) => {
      expect(sides).toBe(20);
      calls++;
      return 4; // planted value — low roll, spell resolves
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 5,
      counterspellSlotLevel: 3,
      counterspellerAbilityMod: 0,
      rng: seededRng,
    });
    expect(calls).toBe(1);
    expect(result.countered).toBe(false);
    expect(result.autoSuccess).toBe(false);
    // Narrow to DC-check arm before accessing .check (exactOptionalPropertyTypes)
    if (result.autoSuccess !== false) throw new Error('expected DC-check arm');
    expect(result.check.dc).toBe(15);
    expect(result.check.d20).toBe(4);
    expect(result.check.total).toBe(4);
  });
});

// ── Cycle 4 — Upcast DC-check: slot 5 cannot auto-counter level 6 (PHB p.281) ─

describe('resolveCounterspell — upcast slot 5 vs level 6 (DC-check required)', () => {
  it('slot 5 < level 6 → DC-check required, NOT auto (PHB p.281 At Higher Levels)', () => {
    // Slot 5 raises threshold to ≤5 only. A 6th-level spell still requires a check.
    // DC = 10 + 6 = 16. Plant d20=17, mod=+0 → total=17 ≥ 16 → countered=true.
    const seededRng: RngFn = (sides) => {
      expect(sides).toBe(20);
      return 17;
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 6,
      counterspellSlotLevel: 5,
      counterspellerAbilityMod: 0,
      rng: seededRng,
    });
    expect(result.countered).toBe(true);
    expect(result.autoSuccess).toBe(false);
    // Narrow to DC-check arm before accessing .check (exactOptionalPropertyTypes)
    if (result.autoSuccess !== false) throw new Error('expected DC-check arm');
    expect(result.check.dc).toBe(16);
    expect(result.check.d20).toBe(17);
    expect(result.check.total).toBe(17);
  });

  it('slot 5 vs level 6, low roll → not countered (PHB p.281)', () => {
    // DC = 10 + 6 = 16. Plant d20=2, mod=+0 → total=2 < 16 → countered=false.
    const seededRng: RngFn = (sides) => {
      expect(sides).toBe(20);
      return 2;
    };
    const result = resolveCounterspell({
      counteredSpellLevel: 6,
      counterspellSlotLevel: 5,
      counterspellerAbilityMod: 0,
      rng: seededRng,
    });
    expect(result.countered).toBe(false);
    expect(result.autoSuccess).toBe(false);
    // Narrow to DC-check arm before accessing .check (exactOptionalPropertyTypes)
    if (result.autoSuccess !== false) throw new Error('expected DC-check arm');
    expect(result.check.dc).toBe(16);
    expect(result.check.d20).toBe(2);
    expect(result.check.total).toBe(2);
  });
});
