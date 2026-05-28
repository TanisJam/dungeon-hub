/**
 * Form-switching subsystem — dedicated Wild Shape stat resolver.
 *
 * applyFormSwitch(input) resolves a single stat value given self stats,
 * beast stats, and the active substitution policy (PHB 66-67).
 *
 * Design ref: sdd/resolution-engine/design — "form-switching subsystem"
 * (an honest concession, built ON TOP of ReplaceMod — NOT generic primitives).
 *
 * Boundary contract:
 *   - applyFormSwitch IS the form-switching computation (standalone resolver).
 *   - It does NOT produce ReplaceMod instances for the registry.
 *   - The use-case layer calls this when it has the beast block materialized
 *     and needs the final value + provenance for a single stat.
 *   - resolveStat handles the generic substitution path (ReplaceMod from registry).
 *   - Both paths produce Resolved<number> shapes; neither duplicates the other.
 *
 * // PHB 66-67: Wild Shape stat substitution + retention + max(self,beast) policy.
 */
import type { StatKey } from '../types.js';
import type { Source } from '../provenance.js';

// ── Input types ───────────────────────────────────────────────────────────────

/**
 * Stat bag — a partial map of stat keys to numeric values.
 * Both selfStats and beastStats are passed as plain records.
 */
export type StatBag = Partial<Record<StatKey, number>>;

export interface FormSwitchInput {
  /** Character's own stat values. */
  selfStats: StatBag;
  /** Beast form's stat values (resolved by use-case layer from BeastStatBlock). */
  beastStats: StatBag;
  /** The stat being queried. */
  stat: StatKey;
  /**
   * Stats retained from self (not replaced by beast).
   * PHB 66: INT, WIS, CHA are always retained.
   */
  retain?: StatKey[];
  /**
   * Policy for overlapping proficiencies (skills/saves).
   * 'max-self-beast': return max(selfBonus, beastBonus) — PHB 66.
   */
  policy?: 'max-self-beast';
  /**
   * If true, equipment resolution is requested — return a GMRuling result.
   * PHB 66: equipment handling in Wild Shape is DM-discretion.
   */
  gmRuling?: boolean;
}

// ── Result types ──────────────────────────────────────────────────────────────

/** Normal (numeric) resolution result. */
export interface FormSwitchResolved {
  value: number;
  breakdown: Source[];
  gmRuling?: never;
  description?: never;
}

/** GMRuling result — equipment handling deferred to DM. */
export interface FormSwitchGmRuling {
  value?: never;
  breakdown?: never;
  gmRuling: true;
  description: string;
}

export type FormSwitchResult = FormSwitchResolved | FormSwitchGmRuling;

// ── applyFormSwitch ───────────────────────────────────────────────────────────

/**
 * Resolves a single stat under Wild Shape rules.
 *
 * Resolution order (per PHB 66-67):
 *   1. GMRuling — equipment stat queries are deferred to DM.
 *   2. Retention — if stat is in the retain list, return self value.
 *   3. max-self-beast policy — for skills/saves, return max(self, beast).
 *   4. Substitution — return beast value with ReplaceMod provenance.
 *
 * Pure — no IO, no registry access. Returns Resolved<number> or GMRuling.
 */
export function applyFormSwitch(input: FormSwitchInput): FormSwitchResult {
  const { selfStats, beastStats, stat, retain = [], policy, gmRuling } = input;

  // ── 1. GMRuling (equipment queries) ─────────────────────────────────────────
  if (gmRuling === true) {
    return {
      gmRuling: true,
      description: 'Equipment handling in Wild Shape is DM-discretion (PHB 66).',
    };
  }

  const selfValue = selfStats[stat] ?? 0;
  const beastValue = beastStats[stat] ?? 0;

  // ── 2. Retention — stat is in the retain list ────────────────────────────────
  if (retain.includes(stat)) {
    return {
      value: selfValue,
      breakdown: [
        {
          label: `${stat} retained from self`,
          amount: selfValue,
          type: 'retain',
          origin: { id: 'self' as import('../types.js').EntityId, conditions: [] },
        },
      ],
    };
  }

  // ── 3. max-self-beast policy (skills/saves) ──────────────────────────────────
  if (policy === 'max-self-beast') {
    const resolvedValue = Math.max(selfValue, beastValue);
    return {
      value: resolvedValue,
      breakdown: [
        {
          label: `self ${stat}`,
          amount: selfValue,
          type: 'untyped',
          origin: { id: 'self' as import('../types.js').EntityId, conditions: [] },
        },
        {
          label: `beast ${stat}`,
          amount: beastValue,
          type: 'ReplaceMod',
          origin: { id: 'beast' as import('../types.js').EntityId, conditions: [] },
        },
      ],
    };
  }

  // ── 4. Substitution — replace with beast value ───────────────────────────────
  return {
    value: beastValue,
    breakdown: [
      {
        label: 'Wild Shape (beast form)',
        amount: beastValue,
        type: 'ReplaceMod',
        origin: { id: 'beast' as import('../types.js').EntityId, conditions: [] },
      },
    ],
  };
}
