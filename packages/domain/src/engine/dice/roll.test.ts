/**
 * Tests for rollDamageBreakdown — pure dice roller with injected RNG.
 *
 * PHB p.196 — "Damage Rolls":
 *   "Roll the damage die or dice, add any modifiers, and apply the damage."
 *
 * PHB p.196 — "Critical Hits":
 *   "Roll all of the attack's damage dice twice and add them together."
 *   Modifiers are NOT doubled — only the dice counts.
 *
 * RED-first: all tests written before implementation.
 * Design ref: sdd/engine-attack-apply-damage/design — ADR-1, ADR-2, ADR-3, ADR-4.
 */

import { describe, expect, it, vi } from 'vitest';
import { rollDamageBreakdown } from './roll.js';
import type { RngFn } from './roll.js';
import type { Source } from '../provenance.js';

// ── Shared test fixtures ───────────────────────────────────────────────────────

/**
 * Breakdown: weapon '1d8' base + flat ability mod +3 + on-hit rider '2d6'.
 * Used for REQ-ATK-ROLLER-01.1, 01.2, and 01.3.
 *
 * CRITICAL (ADR-1): this is the breakdown array from resolveWeaponAttack.
 *   weapon base dice ('1d8') is the `dice` argument, NOT in breakdown.
 *   breakdown contains: ability mod (flat +3) + rider ('2d6').
 *   flatMods is a SUBSET of breakdown — do NOT pass it separately.
 */
const makeStandardBreakdown = (): Source[] => [
  // Ability modifier — flat number source
  {
    label: 'ability',
    amount: 3,
    type: 'untyped',
    origin: { id: 'attacker-1' as never, conditions: [] },
  },
  // On-hit rider (Sneak Attack or similar) — DiceExpr string
  {
    label: 'Sneak Attack',
    amount: '2d6',
    type: 'untyped',
    origin: { id: 'attacker-1' as never, conditions: [] },
  },
];

// ── REQ-ATK-ROLLER-01.1 — min_rng_produces_floor_total ───────────────────────

describe('rollDamageBreakdown', () => {
  it(
    'min_rng_produces_floor_total: floor rng (always 1) → total === 6 (PHB p.196)',
    () => {
      // GIVEN rng = () => 1 (always-min)
      // AND breakdown: weapon '1d8' dice + ability +3 + rider '2d6'
      // WHEN rollDamageBreakdown with crit=false
      // THEN: weapon 1d8=1, rider 2d6=2, flat +3 → total = 1 + 2 + 3 = 6
      // PHB p.196: each die rolls its minimum
      const rng: RngFn = () => 1;
      const breakdown = makeStandardBreakdown();
      const result = rollDamageBreakdown('1d8', breakdown, false, rng);
      expect(result.total).toBe(6);
    },
  );

  // ── REQ-ATK-ROLLER-01.2 — max_rng_produces_ceiling_total ─────────────────────

  it(
    'max_rng_produces_ceiling_total: ceiling rng (sides => sides) → total === 23 (PHB p.196)',
    () => {
      // GIVEN rng = (s) => s (always-max)
      // AND same breakdown as 01.1
      // WHEN rollDamageBreakdown with crit=false
      // THEN: weapon 1d8=8, rider 2d6=12, flat +3 → total = 8 + 12 + 3 = 23
      const rng: RngFn = (s) => s;
      const breakdown = makeStandardBreakdown();
      const result = rollDamageBreakdown('1d8', breakdown, false, rng);
      expect(result.total).toBe(23);
    },
  );

  // ── REQ-ATK-ROLLER-01.3 — perDie_audit_trail_present ─────────────────────────

  it(
    'perDie_audit_trail_present: perDie has one entry per source with label + rolls/flat',
    () => {
      // GIVEN breakdown with 2 sources (ability flat + rider dice) + weapon base
      // WHEN rollDamageBreakdown returns
      // THEN perDie.length === 3 (weapon + ability + rider)
      // AND each entry has `label` and either `rolls` or `flat`
      const rng: RngFn = () => 1;
      const breakdown = makeStandardBreakdown();
      const result = rollDamageBreakdown('1d8', breakdown, false, rng);

      expect(result.perDie.length).toBe(3);

      // Weapon base entry
      const weaponEntry = result.perDie[0]!;
      expect(weaponEntry.label).toBeDefined();
      expect(Array.isArray(weaponEntry.rolls)).toBe(true);

      // Ability mod entry (flat)
      const abilityEntry = result.perDie[1]!;
      expect(abilityEntry.label).toBe('ability');
      expect(abilityEntry.flat).toBe(3);

      // Rider entry (dice)
      const riderEntry = result.perDie[2]!;
      expect(riderEntry.label).toBe('Sneak Attack');
      expect(Array.isArray(riderEntry.rolls)).toBe(true);
      expect(riderEntry.rolls!.length).toBe(2); // 2d6 → 2 die rolls
    },
  );

  // ── REQ-ATK-ROLLER-02.1 — bad_format_throws ──────────────────────────────────

  it(
    'bad_format_throws: compound "1d8+2" throws Error with descriptive message (ADR-2)',
    () => {
      // GIVEN Source.amount = '1d8+2' (compound format, NOT in NdM grammar)
      // WHEN rollDamageBreakdown is called
      // THEN throws Error matching /unrecognized DiceExpr/
      // AND no RNG calls occur prior to throw
      const rng = vi.fn<RngFn>(() => 1);
      const breakdown: Source[] = [
        {
          label: 'bad',
          amount: '1d8+2',
          type: 'untyped',
          origin: { id: 'attacker-1' as never, conditions: [] },
        },
      ];
      expect(() => rollDamageBreakdown('1d8', breakdown, false, rng)).toThrow(
        /unrecognized DiceExpr/i,
      );
    },
  );

  // ── REQ-ATK-ROLLER-02.2 — integer_source_no_rng_call ─────────────────────────

  it(
    'integer_source_passes_without_rng: flat-only breakdown → rng never called for flat source',
    () => {
      // GIVEN breakdown with only a flat integer source (no DiceExpr strings)
      // WHEN rollDamageBreakdown is called
      // THEN rng is called for weapon dice but NOT for the flat source
      // AND perDie entry carries flat: 3
      const rng = vi.fn<RngFn>(() => 1);
      const breakdown: Source[] = [
        {
          label: 'ability',
          amount: 3,
          type: 'untyped',
          origin: { id: 'attacker-1' as never, conditions: [] },
        },
      ];
      const result = rollDamageBreakdown('1d8', breakdown, false, rng);

      // rng called for weapon '1d8' (1 call), NOT for the flat source
      expect(rng).toHaveBeenCalledTimes(1);

      const abilityEntry = result.perDie.find((e) => e.label === 'ability');
      expect(abilityEntry).toBeDefined();
      expect(abilityEntry!.flat).toBe(3);
      expect(abilityEntry!.rolls).toBeUndefined();
    },
  );

  // ── REQ-ATK-CRIT-01.1 — crit_doubles_dice_only ───────────────────────────────

  it(
    'crit_doubles_dice_only: crit=true doubles NdM counts; flat mod unchanged (PHB p.196)',
    () => {
      // GIVEN rng = (s) => s (ceiling) and breakdown: weapon '1d8' + rider '2d6' + flat +3
      // WHEN rollDamageBreakdown with crit=true
      // THEN weapon rolled as 2d8 → 16, rider as 4d6 → 24, flat remains +3
      // AND total === 43
      // PHB p.196: "roll all of the attack's damage dice twice" — modifiers apply once.
      const rng: RngFn = (s) => s;
      const breakdown: Source[] = [
        // Rider dice source
        {
          label: 'Hunter\'s Mark',
          amount: '2d6',
          type: 'untyped',
          origin: { id: 'attacker-1' as never, conditions: [] },
        },
        // Flat ability mod
        {
          label: 'ability',
          amount: 3,
          type: 'untyped',
          origin: { id: 'attacker-1' as never, conditions: [] },
        },
      ];
      const result = rollDamageBreakdown('1d8', breakdown, true, rng);
      // crit: 1d8 → 2d8 = 16; 2d6 → 4d6 = 24; flat +3 unchanged
      expect(result.total).toBe(43); // 16 + 24 + 3
    },
  );

  // ── REQ-ATK-CRIT-01.2 — crit_false_no_doubling ───────────────────────────────

  it(
    'crit_false_no_doubling: crit=false → normal counts; same breakdown = 23 (PHB p.196)',
    () => {
      // GIVEN same breakdown as crit_doubles_dice_only, crit=false
      // WHEN rollDamageBreakdown is called
      // THEN weapon 1d8=8, rider 2d6=12, flat +3 → total = 23 (no doubling)
      const rng: RngFn = (s) => s;
      const breakdown: Source[] = [
        {
          label: 'Hunter\'s Mark',
          amount: '2d6',
          type: 'untyped',
          origin: { id: 'attacker-1' as never, conditions: [] },
        },
        {
          label: 'ability',
          amount: 3,
          type: 'untyped',
          origin: { id: 'attacker-1' as never, conditions: [] },
        },
      ];
      const result = rollDamageBreakdown('1d8', breakdown, false, rng);
      expect(result.total).toBe(23); // 8 + 12 + 3
    },
  );

  // ── REQ-ATK-ROLLER-02.2 (double-count guard) — 1E.4 ─────────────────────────

  it(
    'double_count_guard: crit=true; flat ability mod → exactly 1 flat entry, not doubled (ADR-1)',
    () => {
      // CRITICAL: This test proves flatMods double-count is impossible.
      // breakdown contains flat ability mod +4; crit=true.
      // THEN perDie has exactly 1 flat entry with flat:4 (not doubled, not two entries).
      // If flatMods were ALSO passed, this would show flat:4 twice → test fails.
      // PHB p.196: modifiers apply once, dice are doubled.
      const rng: RngFn = () => 1;
      const breakdown: Source[] = [
        {
          label: 'ability',
          amount: 4,
          type: 'untyped',
          origin: { id: 'attacker-1' as never, conditions: [] },
        },
      ];
      const result = rollDamageBreakdown('1d8', breakdown, true, rng);

      // Exactly one flat entry for the ability mod
      const flatEntries = result.perDie.filter((e) => e.flat !== undefined);
      expect(flatEntries.length).toBe(1);
      expect(flatEntries[0]!.flat).toBe(4);
      expect(flatEntries[0]!.label).toBe('ability');

      // total: crit weapon 2d8 (min=2) + flat 4 = 6
      expect(result.total).toBe(6);
    },
  );

  // ── bad_format on dice argument ────────────────────────────────────────────────

  it(
    'bad_format_on_dice_arg: dice="2d" (malformed) → throws unrecognized DiceExpr',
    () => {
      const rng: RngFn = () => 1;
      expect(() => rollDamageBreakdown('2d' as never, [], false, rng)).toThrow(
        /unrecognized DiceExpr/i,
      );
    },
  );
});
