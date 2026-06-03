/**
 * create-encounter.ts — INSERT encounter + combatants atomically. Sets the
 * encounter's `currentCombatantId` to the highest-initiative combatant
 * (ties broken by insertion order). Run inside a transaction so the encounter
 * never exists without its combatants.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounters, encounterCombatants } from '../../infra/db/schema.js';

export interface CreateEncounterInput {
  campaignId: string;
  sessionId?: string | null;
  name: string;
  combatants: Array<{
    name: string;
    kind: 'pc' | 'npc';
    characterId?: string | null;
    initiative: number;
    hpCurrent: number;
    hpMax: number;
    /** NPC combatants: store AC in DB column. PC combatants: null (derived at attack time). */
    ac?: number | null;
  }>;
}

export interface CreatedEncounter {
  id: string;
  campaignId: string;
  sessionId: string | null;
  name: string;
  round: number;
  status: 'active' | 'completed';
  currentCombatantId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  combatants: Array<{
    id: string;
    name: string;
    kind: 'pc' | 'npc';
    characterId: string | null;
    initiative: number;
    hpCurrent: number;
    hpMax: number;
    ac: number | null;
    insertionOrder: number;
    /** engine-reaction-bus: PHB p.190 — one reaction per round. */
    reactionUsed: boolean;
    // web-combat-observe REQ-WCO-API-01: per-combatant conditions, effects, and action economy.
    // PHB Appendix A p.290-292: condition names. PHB p.251: effect names (Hex, Hunter's Mark, etc.).
    conditions: Array<{ name: string; appliedByCombatantId: string | null }>;
    effects: Array<{ name: string; sourceCombatantId: string | null }>;
    /** PHB p.189 — one action per turn. */
    actionUsed: boolean;
    /** PHB p.189 — one bonus action per turn. */
    bonusActionUsed: boolean;
    /** engine-action-economy: attacks remaining under the current Attack action (Extra Attack). 0 = resting state. */
    attacksRemaining: number;
  }>;
}

export async function createEncounter(input: CreateEncounterInput): Promise<CreatedEncounter> {
  return db.transaction(async (tx) => {
    const [encounter] = await tx
      .insert(encounters)
      .values({
        campaignId: input.campaignId,
        sessionId: input.sessionId ?? null,
        name: input.name,
      })
      .returning();
    if (!encounter) throw new Error('Failed to insert encounter');

    const combatantRows = await tx
      .insert(encounterCombatants)
      .values(
        input.combatants.map((c, idx) => ({
          encounterId: encounter.id,
          name: c.name,
          kind: c.kind,
          characterId: c.characterId ?? null,
          initiative: c.initiative,
          hpCurrent: c.hpCurrent,
          hpMax: c.hpMax,
          // NPC: store provided ac (null if not given). PC: always null (derived at attack time).
          ac: c.kind === 'npc' ? (c.ac ?? null) : null,
          insertionOrder: idx,
        })),
      )
      .returning();

    // currentCombatantId = highest initiative (ties by insertionOrder ASC).
    const first = [...combatantRows].sort(
      (a, b) => b.initiative - a.initiative || a.insertionOrder - b.insertionOrder,
    )[0]!;

    const [updated] = await tx
      .update(encounters)
      .set({ currentCombatantId: first.id })
      .where(eq(encounters.id, encounter.id))
      .returning();
    if (!updated) throw new Error('Failed to set currentCombatantId');

    return {
      id: updated.id,
      campaignId: updated.campaignId,
      sessionId: updated.sessionId,
      name: updated.name,
      round: updated.round,
      status: updated.status as 'active' | 'completed',
      currentCombatantId: updated.currentCombatantId!,
      version: updated.version,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      combatants: combatantRows.map((c) => ({
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
        // web-combat-observe REQ-WCO-API-01/03: new combatants always start with empty
        // conditions/effects and default action-economy state (PHB p.189 — budget resets each turn).
        conditions: [],
        effects: [],
        actionUsed: c.actionUsed,
        bonusActionUsed: c.bonusActionUsed,
        attacksRemaining: c.attacksRemaining,
      })),
    };
  });
}
