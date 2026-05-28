/**
 * advanceTurn — pure rotation of the current-turn pointer in an encounter.
 *
 * Order is `initiative DESC, insertionOrder ASC` (PHB-style highest first;
 * insertion order is the deterministic tie-breaker since Dex tiebreaker is
 * deferred — see sdd/encuentros-v3/spec).
 *
 * Skips combatants with `hpCurrent === 0` (dead). Wraps around to the first
 * alive combatant and increments `round` when current is the last alive.
 *
 * If ALL OTHER combatants are dead, returns current unchanged + `allDead: true`
 * (no infinite loop / DM ends the encounter manually).
 */
export interface AdvanceTurnCombatant {
  id: string;
  initiative: number;
  insertionOrder: number;
  hpCurrent: number;
}

export interface AdvanceTurnInput {
  combatants: AdvanceTurnCombatant[];
  currentCombatantId: string;
  round: number;
}

export interface AdvanceTurnResult {
  currentCombatantId: string;
  round: number;
  wrapped: boolean;
  allDead: boolean;
}

export function advanceTurn(input: AdvanceTurnInput): AdvanceTurnResult {
  const sorted = [...input.combatants].sort(
    (a, b) => b.initiative - a.initiative || a.insertionOrder - b.insertionOrder,
  );

  const aliveIdxs: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i]!.hpCurrent > 0) aliveIdxs.push(i);
  }

  // Edge: 0 alive overall (shouldn't really happen if current was alive when called).
  if (aliveIdxs.length === 0) {
    return {
      currentCombatantId: input.currentCombatantId,
      round: input.round,
      wrapped: false,
      allDead: true,
    };
  }

  // Edge: only current is alive.
  if (aliveIdxs.length === 1) {
    return {
      currentCombatantId: sorted[aliveIdxs[0]!]!.id,
      round: input.round,
      wrapped: false,
      allDead: true,
    };
  }

  const currentSortedIdx = sorted.findIndex((c) => c.id === input.currentCombatantId);
  // Defensive: current not in list → start at top of alive set.
  if (currentSortedIdx === -1) {
    return {
      currentCombatantId: sorted[aliveIdxs[0]!]!.id,
      round: input.round,
      wrapped: false,
      allDead: false,
    };
  }

  // Find next alive after currentSortedIdx (wrapping around).
  let nextSortedIdx = -1;
  let wrapped = false;
  for (let step = 1; step <= sorted.length; step++) {
    const candidate = (currentSortedIdx + step) % sorted.length;
    if (sorted[candidate]!.hpCurrent > 0) {
      nextSortedIdx = candidate;
      wrapped = candidate <= currentSortedIdx;
      break;
    }
  }

  return {
    currentCombatantId: sorted[nextSortedIdx]!.id,
    round: wrapped ? input.round + 1 : input.round,
    wrapped,
    allDead: false,
  };
}
