/**
 * applyDamageWithResist — pure damage resolution with resistance and immunity.
 *
 * REQ-RI-01..05 / ADR-3
 *
 * PHB p.197 — Damage Resistance and Immunity:
 *   "If a creature or an object has resistance to a damage type, damage of
 *    that type is halved against it. If a creature or an object has immunity
 *    to a damage type, damage of that type is ignored."
 *
 * PHB p.197 — Resolution order:
 *   "Resistance and then vulnerability are applied after all other modifiers
 *    to damage." → called AFTER rollDamageBreakdown, BEFORE HP subtract.
 *
 * PHB p.197 — No stacking:
 *   "Multiple instances of resistance don't stack." → halve ONCE regardless
 *    of how many half-mods match.
 *
 * Precedence:
 *   1. Gather mods matching damageType (exact type OR 'all').
 *   2. If ANY match is mode:'immune' → finalDamage = 0 (immune WINS over half).
 *   3. Else if ANY match is mode:'half' → finalDamage = Math.floor(rolled / 2)
 *      applied ONCE (no stacking — PHB p.197).
 *   4. Else → finalDamage = rolledDamage (identity, no transform).
 *   5. newHp = Math.max(0, hpCurrent - finalDamage).
 *
 * Pure function: no IO, no DB, no side effects.
 * Design ref: sdd/engine-resist-immunity/design — ADR-3.
 */
import type { ResistMod } from '../engine/types.js';
import { applyDamage } from './apply-damage.js';

// ── Optional informative constant (NOT a gate — DM homebrew types must pass) ──
// TODO #513: move to DB-injected resolver when reference data migrates.
export const STANDARD_DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;

// ── Input / Output types ──────────────────────────────────────────────────────

export interface ApplyDamageWithResistInput {
  /** Target's current HP before damage. */
  hpCurrent: number;
  /** Integer damage total AFTER all other modifiers (PHB p.197). */
  rolledDamage: number;
  /** The incoming damage instance's type (e.g. 'fire', 'slashing', 'force'). */
  damageType: string;
  /** Resolved ResistMods on the TARGET (from loadTargetResistMods or tests). */
  resistMods: ResistMod[];
}

export interface ApplyDamageWithResistResult {
  /** Damage after resist/immune transform. */
  finalDamage: number;
  /** Math.max(0, hpCurrent - finalDamage) — clamps at 0 (PHB p.197). */
  newHp: number;
  /** Provenance breakdown for transparency. */
  breakdown: {
    rolledDamage: number;
    /** 'none' = full; 'half' = resistance applied; 'immune' = immunity applied. */
    outcome: 'none' | 'half' | 'immune';
    finalDamage: number;
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Applies damage to a target factoring in resistance and immunity mods.
 *
 * @param input.hpCurrent   - Target's current HP before damage.
 * @param input.rolledDamage - Damage total after all other modifiers.
 * @param input.damageType   - The incoming damage instance's type.
 * @param input.resistMods   - ResistMods on the target (may be empty).
 * @returns finalDamage, newHp, and a breakdown for provenance.
 */
export function applyDamageWithResist(
  input: ApplyDamageWithResistInput,
): ApplyDamageWithResistResult {
  const { hpCurrent, rolledDamage, damageType, resistMods } = input;

  // Step 1: gather mods matching the incoming damage type.
  // A mod matches if its damageType equals the incoming type (exact) or is 'all'.
  const matches = resistMods.filter(
    (m) => m.damageType === 'all' || m.damageType === damageType,
  );

  // Step 2: determine outcome — immune > half > none (PHB p.197).
  let outcome: 'none' | 'half' | 'immune' = 'none';

  if (matches.some((m) => m.mode === 'immune')) {
    // PHB p.197: immunity → damage is ignored (0). Immune WINS over half.
    outcome = 'immune';
  } else if (matches.some((m) => m.mode === 'half')) {
    // PHB p.197: resistance → halve ONCE regardless of count. No stacking.
    outcome = 'half';
  }

  // Step 3: compute finalDamage from outcome.
  let finalDamage: number;
  switch (outcome) {
    case 'immune':
      finalDamage = 0;
      break;
    case 'half':
      finalDamage = Math.floor(rolledDamage / 2);
      break;
    default:
      finalDamage = rolledDamage;
  }

  // Step 4: apply to HP, clamping at 0 (delegates to applyDamage for consistency).
  const newHp = applyDamage(hpCurrent, finalDamage);

  return {
    finalDamage,
    newHp,
    breakdown: {
      rolledDamage,
      outcome,
      finalDamage,
    },
  };
}
