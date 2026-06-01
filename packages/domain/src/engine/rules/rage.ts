/**
 * buildRageModifiers — Rage rule encoding.
 *
 * PHB p.48 — Rage (Barbarian):
 *   "You have advantage on Strength checks and Strength saving throws."
 *   "When you make a melee weapon attack using Strength, you gain a bonus to the
 *    damage roll that increases as you gain levels as a barbarian."
 *     - Level 1–8:  +2
 *     - Level 9–15: +3
 *     - Level 16+:  +4
 *   "You have resistance to bludgeoning, piercing, and slashing damage."
 *   "You can't cast spells or concentrate on them while raging."
 *
 * REQ-RAGE-03 (resistMods), REQ-RAGE-04 (instances), REQ-RAGE-05 (numMod)
 *
 * Design — SPLIT RETURN (ADR-1, mirrors buildPetrifiedModifiers):
 *   resistMods[] → 3× b/p/s ResistMods → consumed by loadTargetResistMods
 *                  (helper path, NOT registry — level-independent).
 *   instances[]  → 2× STR self AdvantageMods → registered in build-attack-context
 *                  'Raging' attacker arm (registry path, resolveRollMode).
 *   numMod       → bare NumMod (rage damage, level-scaled) → use-case wraps into
 *                  a ModifierInstance with MELEE+STR predicate + on-hit scope
 *                  (ADR-5: predicate wiring is IO-adjacent, not pure domain's job).
 *
 * WHY split: three resolution timings.
 *   resistMods → post-roll (applyDamageWithResist).
 *   instances  → pre-roll (registry query, resolveRollMode).
 *   numMod     → on-hit damage (registered by use-case with weapon-kind predicate).
 *
 * ADR-2: NO ConditionDefinition for 'Raging' — Rage has no outgoing attackers-of
 * mod needing a def; all mods emit directly from buildRageModifiers.
 *
 * // TODO #513: barbarianLevel will be injected from runtime DB resolver per §1.2.
 */
import type { EntityId, ResistMod, NumMod } from '../types.js';
import type { ModifierInstance, ModifierInstanceId } from '../registry/types.js';

// ── Return type ───────────────────────────────────────────────────────────────

/**
 * Result type for buildRageModifiers — three-channel split return (ADR-1).
 *
 * ok:true  → all three channels populated.
 * ok:false → not used (buildRageModifiers never fails; kept for API symmetry
 *             with BuildPetrifiedResult; the union is resolved at call sites).
 *
 * NOTE: ok:false branch is retained for future guard (e.g. barbarianLevel < 1
 * or a future catalog-backed validation). Currently unreachable.
 */
export type BuildRageResult =
  | {
      ok: true;
      /** STR-check + STR-save self AdvantageMods (registry path). */
      instances: ModifierInstance[];
      /** Rage damage bonus (bare NumMod; use-case wraps with MELEE+STR predicate). */
      numMod: NumMod;
      /** 3× b/p/s half ResistMods (helper path, loadTargetResistMods). */
      resistMods: ResistMod[];
    }
  | { ok: false; issues: [{ code: 'INVALID_BARBARIAN_LEVEL'; got: number }] };

// ── Helpers ───────────────────────────────────────────────────────────────────

function iid(s: string): ModifierInstanceId {
  return s as ModifierInstanceId;
}

// ── Fixed ResistMods for Rage (PHB p.48) — level-independent ─────────────────

/**
 * Physical damage resistances granted by Rage (PHB p.48).
 * All three are constant regardless of barbarian level.
 */
const RAGE_RESIST_MODS: ResistMod[] = [
  { kind: 'resist', damageType: 'bludgeoning', mode: 'half' }, // PHB p.48
  { kind: 'resist', damageType: 'piercing', mode: 'half' },    // PHB p.48
  { kind: 'resist', damageType: 'slashing', mode: 'half' },    // PHB p.48
] as const;

// ── Rage damage bonus table (PHB p.48) ────────────────────────────────────────

/**
 * Returns the rage damage bonus for a given barbarian level (PHB p.48).
 *   L1–8:  +2
 *   L9–15: +3
 *   L16+:  +4
 */
function rageBonus(barbarianLevel: number): 2 | 3 | 4 {
  if (barbarianLevel >= 16) return 4;
  if (barbarianLevel >= 9) return 3;
  return 2;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Builds the three-channel modifier set for the Raging condition.
 *
 * @param barbarianLevel  - Sum of barbarian class levels (server-derived from
 *                          characters.data.classes, same pattern as rogueLevel /
 *                          monkLevel in build-attack-context.ts).
 * @param ragerId         - EntityId of the raging character (characters.id — NOT
 *                          the combatant UUID). Used for instance ID scoping and
 *                          the self-axis target in instances[].
 *
 * @returns BuildRageResult — ok:true with all three channels.
 */
export function buildRageModifiers(
  barbarianLevel: number,
  ragerId: EntityId,
): BuildRageResult {
  const bonus = rageBonus(barbarianLevel);

  // ── Channel 1: instances — 2× STR self AdvantageMods ─────────────────────
  // PHB p.48: "advantage on Strength checks and Strength saving throws"
  // Bound to ragerId self-axis (entities:[ragerId]).
  // Registered in build-attack-context 'Raging' attacker arm → resolveRollMode.
  // STR-SAVE advantage uses a different path (ADR-6 — performForcedCheck inline
  // derivation), but the instance is still emitted here for use-case symmetry.
  const instances: ModifierInstance[] = [
    {
      id: iid(`rage-str-check-${ragerId}`),
      label: 'Raging',
      def: { kind: 'advantage', mode: 'grant', rollType: 'check' },
      scope: {
        owner: ragerId,
        target: { axis: 'entities', ids: [ragerId] },
        trigger: 'always',
      },
    },
    {
      id: iid(`rage-str-save-${ragerId}`),
      label: 'Raging',
      def: { kind: 'advantage', mode: 'grant', rollType: 'save' },
      scope: {
        owner: ragerId,
        target: { axis: 'entities', ids: [ragerId] },
        trigger: 'always',
      },
    },
  ];

  // ── Channel 2: numMod — rage damage bonus (bare, NOT wrapped) ────────────
  // PHB p.48: "+[rage damage] to melee weapon attacks using Strength"
  // Level-scaled: +2 L1-8 / +3 L9-15 / +4 L16+.
  // Returned as a BARE NumMod so the use-case (build-attack-context) can wrap
  // it into a ModifierInstance with the MELEE+STR predicate + on-hit scope
  // at registration time (ADR-5 — predicate wiring is IO-adjacent).
  const numMod: NumMod = {
    kind: 'num',
    op: 'add',
    value: bonus,
    stat: 'damage',
    category: 'untyped',
  };

  // ── Channel 3: resistMods — 3× b/p/s half (level-independent) ────────────
  // PHB p.48: "resistance to bludgeoning, piercing, and slashing damage"
  // Consumed by loadTargetResistMods in resolve-resistance.ts (helper path,
  // NOT in the modifier registry — keeps registry attacker-centric per ADR-1).

  return {
    ok: true,
    instances,
    numMod,
    resistMods: [...RAGE_RESIST_MODS],
  };
}
