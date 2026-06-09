/**
 * resolveResistance — server-authoritative damage-resistance helper.
 *
 * engine-resist-immunity Batch C (C-1):
 * Loads the target combatant's active conditions from the DB (conditions-only,
 * NOT a full sheet or registry build), maps Petrified → ResistMod[] via
 * buildPetrifiedModifiers, and delegates to the pure domain applyDamageWithResist
 * function.
 *
 * Design ref: sdd/engine-resist-immunity/design — ADR-4
 *
 * SERVER-AUTHORITY INVARIANT:
 * Resistance is always resolved server-side from DB-loaded conditions.
 * Client-supplied damage values, types, or flags NEVER bypass this gate.
 * (REQ-RI-07, project invariant).
 *
 * SHARED BY BOTH APPLY PATHS:
 * perform-weapon-attack-apply and perform-cast-spell-apply both call resolveResistance.
 * A single file prevents drift between the two paths.
 *
 * ATOMICITY NOTE:
 * loadTargetResistMods runs OUTSIDE the CAS transaction (read-then-CAS).
 * Resistance is a deterministic transform of already-loaded conditions; no
 * atomicity concern with the HP write (HP write is still guarded by version CAS).
 */

import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounterCombatantConditions } from '../../infra/db/schema.js';
import {
  applyDamageWithResist,
  buildPetrifiedModifiers,
  PETRIFIED_CONDITION_DEF,
  compileRule,
  rageRuleDoc,
  type ResistMod,
} from '@dungeon-hub/domain/engine';
import type { EntityId } from '@dungeon-hub/domain/engine';

// Compiled once at module scope — pure/no-IO. .build() called per request (ADR-3).
// PHB p.48 — rageRuleDoc encodes the full Rage modifier set (7 emits).
const compiledRage = compileRule(rageRuleDoc);

// ── loadTargetResistMods ───────────────────────────────────────────────────────

/**
 * Loads the target combatant's active conditions from encounter_combatant_conditions
 * and maps each to its ResistMod[] (conditions-only load — no character sheet, no registry).
 *
 * Current condition → ResistMod mapping:
 *   Petrified → { kind:'resist', damageType:'all', mode:'half' }
 *             + { kind:'resist', damageType:'poison', mode:'immune' }
 *
 * Returns an empty array when the target has no resist-bearing conditions.
 *
 * @param targetCombatantId - encounter_combatants.id of the target.
 */
export async function loadTargetResistMods(targetCombatantId: string): Promise<ResistMod[]> {
  const conditionRows = await db
    .select({ conditionName: encounterCombatantConditions.conditionName })
    .from(encounterCombatantConditions)
    .where(eq(encounterCombatantConditions.combatantId, targetCombatantId));

  const resistMods: ResistMod[] = [];

  for (const { conditionName } of conditionRows) {
    if (conditionName === 'Petrified') {
      const result = buildPetrifiedModifiers(
        targetCombatantId as EntityId,
        (name) => (name === 'Petrified' ? PETRIFIED_CONDITION_DEF : null),
      );
      if (result.ok) {
        resistMods.push(...result.resistMods);
      }
    }
    // engine-rage: Raging barbarian has resistance to bludgeoning, piercing, slashing (PHB p.48).
    // resistMods are level-independent (PHB p.48 — resistance is not level-gated).
    // rageBonus:2 and rageCount:1 are documented dummies — ResistMods ignore these params.
    // REQ-RAGE-03, REQ-WIRE-02.
    if (conditionName === 'Raging') {
      const rageInstances = compiledRage.build({ ragerId: targetCombatantId as EntityId, rageBonus: 2, rageCount: 1 });
      const resistInstances = rageInstances.filter((i) => i.def.kind === 'resist');
      for (const i of resistInstances) {
        resistMods.push(i.def as ResistMod); // push .def (ResistMod), NOT the ModifierInstance
      }
    }
  }

  return resistMods;
}

// ── resolveResistance ─────────────────────────────────────────────────────────

/**
 * Resolves resistance/immunity for an incoming damage instance.
 *
 * Loads target's ResistMods from DB conditions, then delegates to the pure
 * applyDamageWithResist domain function (PHB p.197).
 *
 * @param targetCombatantId - encounter_combatants.id of the target.
 * @param rolledDamage      - Integer total AFTER all other modifiers (PHB p.197).
 * @param damageType        - Damage type of the incoming instance (e.g. 'slashing', 'force').
 * @param hpCurrent         - Target's current HP before this damage.
 */
export async function resolveResistance(
  targetCombatantId: string,
  rolledDamage: number,
  damageType: string,
  hpCurrent: number,
): Promise<{
  finalDamage: number;
  newHp: number;
  breakdown: {
    rolledDamage: number;
    outcome: 'none' | 'half' | 'immune';
    finalDamage: number;
  };
}> {
  const resistMods = await loadTargetResistMods(targetCombatantId);
  return applyDamageWithResist({ hpCurrent, rolledDamage, damageType, resistMods });
}
