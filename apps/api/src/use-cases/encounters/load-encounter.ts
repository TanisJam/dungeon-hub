/**
 * load-encounter.ts — Loads an encounter + its combatants (ordered by
 * initiative DESC, insertionOrder ASC). Returns null when not found.
 *
 * web-combat-observe REQ-WCO-API-01/02 (D1 architecture decision):
 *   Extends combatant shape with conditions[], effects[], and action-economy fields.
 *   Two additional child-table queries use `WHERE combatant_id IN (...)` — no cartesian
 *   fan-out vs a multi-JOIN, and trivially tolerant of empty rows (REQ-WCO-API-02).
 *   Edge: when the combatant set is empty, the IN-list queries are skipped entirely
 *   (SQL does not allow `WHERE x IN ()` — that is a syntax error).
 */
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  encounters,
  encounterCombatants,
  encounterCombatantConditions,
  encounterCombatantEffects,
} from '../../infra/db/schema.js';
import type { CreatedEncounter } from './create-encounter.js';

export type LoadedEncounter = CreatedEncounter;

export async function loadEncounter(id: string): Promise<LoadedEncounter | null> {
  const [row] = await db.select().from(encounters).where(eq(encounters.id, id)).limit(1);
  if (!row) return null;

  const combatants = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.encounterId, id))
    .orderBy(desc(encounterCombatants.initiative), asc(encounterCombatants.insertionOrder));

  // Edge (REQ-WCO-API-02 / task 1.4): short-circuit when there are no combatants —
  // `WHERE combatant_id IN ()` is a SQL syntax error. Empty combatant set returns no children.
  if (combatants.length === 0) {
    return {
      id: row.id,
      campaignId: row.campaignId,
      sessionId: row.sessionId,
      name: row.name,
      round: row.round,
      status: row.status as 'active' | 'completed',
      currentCombatantId: row.currentCombatantId!,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      combatants: [],
    };
  }

  const combatantIds = combatants.map((c) => c.id);

  // D1: two batched IN-list queries — one for conditions, one for effects.
  // Missing child rows → empty arrays (REQ-WCO-API-02 — read-path tolerance for legacy combatants).
  // Ordered by createdAt ASC for stable badge order per D2.
  const [conditionRows, effectRows] = await Promise.all([
    db
      .select({
        combatantId: encounterCombatantConditions.combatantId,
        name: encounterCombatantConditions.conditionName,
        appliedByCombatantId: encounterCombatantConditions.appliedByCombatantId,
      })
      .from(encounterCombatantConditions)
      .where(inArray(encounterCombatantConditions.combatantId, combatantIds))
      .orderBy(asc(encounterCombatantConditions.createdAt)),

    db
      .select({
        combatantId: encounterCombatantEffects.combatantId,
        name: encounterCombatantEffects.effectName,
        sourceCombatantId: encounterCombatantEffects.sourceCombatantId,
      })
      .from(encounterCombatantEffects)
      .where(inArray(encounterCombatantEffects.combatantId, combatantIds))
      .orderBy(asc(encounterCombatantEffects.createdAt)),
  ]);

  // Group into per-combatant maps for O(n) merge.
  const conditionMap = new Map<string, Array<{ name: string; appliedByCombatantId: string | null }>>();
  for (const r of conditionRows) {
    const list = conditionMap.get(r.combatantId) ?? [];
    list.push({ name: r.name, appliedByCombatantId: r.appliedByCombatantId ?? null });
    conditionMap.set(r.combatantId, list);
  }

  const effectMap = new Map<string, Array<{ name: string; sourceCombatantId: string | null }>>();
  for (const r of effectRows) {
    const list = effectMap.get(r.combatantId) ?? [];
    list.push({ name: r.name, sourceCombatantId: r.sourceCombatantId ?? null });
    effectMap.set(r.combatantId, list);
  }

  return {
    id: row.id,
    campaignId: row.campaignId,
    sessionId: row.sessionId,
    name: row.name,
    round: row.round,
    status: row.status as 'active' | 'completed',
    currentCombatantId: row.currentCombatantId!,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    combatants: combatants.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind as 'pc' | 'npc',
      characterId: c.characterId,
      initiative: c.initiative,
      hpCurrent: c.hpCurrent,
      hpMax: c.hpMax,
      ac: c.ac,
      insertionOrder: c.insertionOrder,
      reactionUsed: c.reactionUsed,
      // web-combat-observe REQ-WCO-API-01: conditions and effects from child tables.
      // Missing rows → [] (REQ-WCO-API-02 — legacy combatants are tolerant).
      conditions: conditionMap.get(c.id) ?? [],
      effects: effectMap.get(c.id) ?? [],
      // web-combat-observe REQ-WCO-API-01: action-economy scalars.
      // Schema columns are NOT NULL DEFAULT false/0 — DB always returns a defined value.
      actionUsed: c.actionUsed,
      bonusActionUsed: c.bonusActionUsed,
      attacksRemaining: c.attacksRemaining,
    })),
  };
}
