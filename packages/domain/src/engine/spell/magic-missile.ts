/**
 * rollMagicMissile — pure Magic Missile damage roller.
 *
 * PHB p.257 — Magic Missile:
 *   "You create three glowing darts of magical force. Each dart hits a creature
 *    of your choice that you can see within range. A dart deals 1d4+1 force
 *    damage to its target. The darts all strike simultaneously, and you can
 *    direct them to hit one creature or several."
 *
 *   "When you cast this spell using a spell slot of 2nd level or higher, the
 *    spell creates one more dart for each slot level above 1st."
 *
 * Auto-hit: no attack roll, no saving throw (PHB p.257 — darts hit automatically).
 * No crit path: only attack rolls can crit (PHB p.196); MM is not an attack roll.
 * Damage type: force (PHB p.257).
 *
 * Design ref: sdd/engine-spell-cast-suspend/design — ADR-7 (rollMagicMissile).
 * RNG injection: mirrors rollDamageBreakdown's RngFn pattern (ADR-4 in engine-attack-apply-damage).
 *
 * CRITICAL: domain pure — no IO, no DB, no fetch.
 */

import { rollDamageBreakdown } from '../dice/roll.js';
import type { RngFn } from '../dice/roll.js';
import type { EntityRef } from '../context.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Input for rollMagicMissile.
 *
 * slotLevel: the spell slot level used (1–9). dartCount = 3 + (slotLevel - 1).
 * rng: injected random function (returns integer in [1..sides]).
 *   - Tests inject: floor `() => 1`, ceiling `(s) => s`.
 *   - Production: crypto RNG in the use-case layer (never in domain).
 */
export interface RollMagicMissileInput {
  slotLevel: number;
  rng: RngFn;
}

/**
 * Result of rolling Magic Missile darts.
 *
 * dartCount: how many darts were rolled (3 + slotLevel - 1).
 * perDart: per-dart integer damage values for mobile provenance UI.
 * total: sum of all dart damage values.
 * damageType: always 'force' (PHB p.257).
 */
export interface RollMagicMissileResult {
  dartCount: number;
  perDart: number[];
  total: number;
  damageType: 'force';
}

// ── Sentinel origin (used for Source.origin in rollDamageBreakdown) ───────────

/** Synthetic EntityRef for MM dart provenance — no real entity needed (auto-hit). */
const MM_ORIGIN: EntityRef = {
  id: 'magic-missile-spell' as import('../types.js').EntityId,
  conditions: [],
};

// ── rollMagicMissile ──────────────────────────────────────────────────────────

/**
 * Rolls all Magic Missile darts for a given slot level, returning per-dart
 * damage values and the total.
 *
 * Dart count: 3 + (slotLevel - 1). PHB p.257: 3 at 1st level, +1 per level above.
 * Each dart: 1d4+1 force (no crit, no attack roll — PHB p.257).
 *
 * Uses rollDamageBreakdown('1d4', [{flat +1}], false, rng) per dart, reusing the
 * proven dice primitive. crit=false always (auto-hit spells never crit).
 *
 * @param input - { slotLevel, rng }
 * @returns { dartCount, perDart, total, damageType: 'force' }
 */
export function rollMagicMissile(input: RollMagicMissileInput): RollMagicMissileResult {
  const { slotLevel, rng } = input;

  // PHB p.257: dartCount = 3 at 1st level, +1 for each slot level above 1st.
  const dartCount = 3 + (slotLevel - 1);

  const perDart: number[] = [];

  for (let i = 0; i < dartCount; i++) {
    // Each dart: 1d4 + 1 flat force (PHB p.257).
    // breakdown = [{ label: 'force', amount: 1, flat }] — the +1 to each dart.
    // crit=false — auto-hit spells have no crit path (PHB p.196 crits require attack rolls).
    const result = rollDamageBreakdown(
      '1d4',
      [
        {
          label: 'force',
          amount: 1,
          type: 'untyped' as const,
          origin: MM_ORIGIN,
        },
      ],
      false,
      rng,
    );
    perDart.push(result.total);
  }

  const total = perDart.reduce((acc, d) => acc + d, 0);

  return {
    dartCount,
    perDart,
    total,
    damageType: 'force',
  };
}
