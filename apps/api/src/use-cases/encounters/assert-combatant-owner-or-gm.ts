/**
 * assertCombatantOwnerOrGm — shared owner-OR-GM authorization helper.
 *
 * REQ-WCR-AUTH-01: The ONLY place in the codebase where combatant→character→userId
 * ownership is resolved for encounter actions. Built for reuse by all encounter
 * use-cases that need an owner-OR-GM gate (activate-rage, deactivate-rage, and
 * future web-combat-turn actions).
 *
 * Does NOT throw — returns a discriminated union. Callers fold the result into
 * their own result union per the codebase convention (pure-ish use-cases).
 *
 * FORBIDDEN-vs-NOT_FOUND mapping (locked per ADR-1):
 *   - GM caller:                           { ok: true }  (no ownership check)
 *   - combatant not found:                 { ok: false, code: 'NOT_FOUND' }
 *   - NPC combatant (characterId null)     { ok: false, code: 'NOT_FOUND' }
 *     AND caller is player:                (404, no FORBIDDEN leak)
 *   - character.userId === callerId:        { ok: true }  (owner)
 *   - character.userId !== callerId:        { ok: false, code: 'FORBIDDEN' }
 *
 * Auth-check ORDER (ADR-1): the helper is called AFTER the encounter version load
 * + turn guard (NOT_YOUR_TURN 409), but BEFORE any resource/economy gates and the
 * CAS transaction. Rationale: VERSION_CONFLICT and NOT_YOUR_TURN are state-of-the-world
 * facts cheaper and more honest to surface first; authz MUST precede any mutation
 * or resource disclosure.
 *
 * NOTE: getCharacterAccess is intentionally NOT reused here. It resolves
 * owner-OR-world-member, which is too broad — a world-member who is not the
 * character owner must NOT be able to rage another player's combatant.
 * This helper does a direct characters.userId comparison instead.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { encounterCombatants, characters } from '../../infra/db/schema.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Discriminated result — folded by callers into their own result union. */
export type CombatantAuthResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' }   // combatant missing OR NPC targeted by player
  | { ok: false; code: 'FORBIDDEN' };  // combatant owned by a different player

// ── assertCombatantOwnerOrGm ──────────────────────────────────────────────────

/**
 * Resolves whether a caller is authorized to act on a combatant:
 * GM passes unconditionally; players must own the combatant's character.
 */
export async function assertCombatantOwnerOrGm(input: {
  encounterId: string;
  combatantId: string;
  callerId: string;
  callerRole: 'gm' | 'player';
}): Promise<CombatantAuthResult> {
  const { encounterId, combatantId, callerId, callerRole } = input;

  // ── Step 1: Load combatant ────────────────────────────────────────────────
  const [combatantRow] = await db
    .select({ id: encounterCombatants.id, characterId: encounterCombatants.characterId })
    .from(encounterCombatants)
    .where(
      and(
        eq(encounterCombatants.id, combatantId),
        eq(encounterCombatants.encounterId, encounterId),
      ),
    )
    .limit(1);

  if (!combatantRow) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  // ── Step 2: GM short-circuit ──────────────────────────────────────────────
  // GM may act on any combatant (PC or NPC) without ownership check.
  if (callerRole === 'gm') {
    return { ok: true };
  }

  // ── Step 3: NPC gate (player targeting NPC) ───────────────────────────────
  // characterId null means NPC — player UI never offers the button for NPCs;
  // return NOT_FOUND to avoid leaking FORBIDDEN information.
  if (combatantRow.characterId === null || combatantRow.characterId === undefined) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  // ── Step 4: Load character for ownership resolution ───────────────────────
  const [charRow] = await db
    .select({ id: characters.id, userId: characters.userId })
    .from(characters)
    .where(eq(characters.id, combatantRow.characterId))
    .limit(1);

  if (!charRow) {
    return { ok: false, code: 'NOT_FOUND' };
  }

  // ── Step 5: Ownership check ───────────────────────────────────────────────
  if (charRow.userId !== callerId) {
    return { ok: false, code: 'FORBIDDEN' };
  }

  return { ok: true };
}
