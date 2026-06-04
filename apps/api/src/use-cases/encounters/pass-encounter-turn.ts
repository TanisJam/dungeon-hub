/**
 * pass-encounter-turn — Player passes own turn (C1, web-combat-pass-turn).
 *
 * PHB p.189 — A creature may take fewer actions and declare its turn complete.
 * "Pass Turn" is a VTT convenience; no new game-mechanical content.
 *
 * ADR-1 gate order (LOCKED):
 *   1. loadEncounter(id)             → null ⇒ NOT_FOUND
 *   2. status !== 'active'           → ENCOUNTER_NOT_ACTIVE
 *   3. assertCombatantOwnerOrGm      → FORBIDDEN / NOT_FOUND (targets currentCombatantId)
 *   4. advanceEncounterTurn(id, ver) → VERSION_CONFLICT / NOT_FOUND
 *
 * Security: authz ALWAYS targets server-derived currentCombatantId — no body-supplied
 * combatant id. A non-current player fails ownership = FORBIDDEN (not NOT_YOUR_TURN).
 *
 * REQ-WCPT-API-02. ADR-1 (design/web-combat-pass-turn).
 */

import { loadEncounter } from './load-encounter.js';
import { assertCombatantOwnerOrGm } from './assert-combatant-owner-or-gm.js';
import { advanceEncounterTurn } from './advance-encounter-turn.js';
import type { LoadedEncounter } from './load-encounter.js';

// ── Output ─────────────────────────────────────────────────────────────────────

export type PassTurnResult =
  | { ok: true; encounter: LoadedEncounter }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'ENCOUNTER_NOT_ACTIVE' }
  | { ok: false; code: 'FORBIDDEN' }
  | { ok: false; code: 'VERSION_CONFLICT' };

// ── passEncounterTurn ─────────────────────────────────────────────────────────

export async function passEncounterTurn(input: {
  encounterId: string;
  version: number;
  callerId: string;
  callerRole: 'gm' | 'player';
}): Promise<PassTurnResult> {
  const { encounterId, version, callerId, callerRole } = input;

  // ── Step 1: Load encounter ────────────────────────────────────────────────────
  const encounter = await loadEncounter(encounterId);
  if (!encounter) return { ok: false, code: 'NOT_FOUND' };

  // ── Step 2: Active status guard ───────────────────────────────────────────────
  // advanceEncounterTurn lacks this guard; pass-turn ADDS it (ADR-1).
  if (encounter.status !== 'active') {
    return { ok: false, code: 'ENCOUNTER_NOT_ACTIVE' };
  }

  // ── Step 3: Owner-OR-GM authz on currentCombatantId (REQ-WCPT-API-02, ADR-1) ─
  // Security: targets server-derived currentCombatantId only — no caller-supplied id.
  const authzResult = await assertCombatantOwnerOrGm({
    encounterId,
    combatantId: encounter.currentCombatantId,
    callerId,
    callerRole,
  });

  if (!authzResult.ok) {
    if (authzResult.code === 'FORBIDDEN') {
      return { ok: false, code: 'FORBIDDEN' };
    }
    // NOT_FOUND from helper: NPC target or missing combatant — no info leak.
    return { ok: false, code: 'NOT_FOUND' };
  }

  // ── Step 4: Delegate to existing advanceEncounterTurn (engine unchanged) ──────
  const advanceResult = await advanceEncounterTurn(encounterId, version);

  if (!advanceResult.ok) {
    // advanceEncounterTurn returns NOT_FOUND | VERSION_CONFLICT
    if (advanceResult.code === 'VERSION_CONFLICT') {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    return { ok: false, code: 'NOT_FOUND' };
  }

  return { ok: true, encounter: advanceResult.encounter };
}
