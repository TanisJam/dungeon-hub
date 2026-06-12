/**
 * Surprise condition predicates — engine-surprise-round1.
 *
 * PHB p.189 — Surprise:
 *   "If you're surprised, you can't move or take an action on your first turn of the
 *    combat, and you can't take a reaction until that turn ends."
 *   Gate predicate = surprised && !firstTurnActed. NO round condition (late joiners: #2252.3).
 *
 * PHB p.50 — Feral Instinct (Barbarian):
 *   "If you are surprised at the beginning of combat and aren't incapacitated, you can
 *    act normally on your first turn, but only if you enter your rage before doing
 *    anything else on that turn."
 *
 * ADR-2 honest-contract (engine-surprise-round1/design):
 *   `isSurprisedFirstTurn` — NO dead fields (no round, no character context).
 *   `isSurpriseExempt` — takes ONLY the two facts that gate the exemption (L7+, not incapacitated).
 *   It does NOT take surprised/firstTurnActed (the caller already knows the gate fired)
 *   nor ragedThisTurn (the rage activation is the act being permitted, not a precondition).
 *
 * Post-design #2256 semantics (Feral Instinct "before anything else"):
 *   "Rage first" = rage is the first SUCCESSFUL act of the turn.
 *   A REJECTED attempt (ACTOR_SURPRISED returned, no budget consumed) is a no-op in the fiction.
 *   No per-turn attempt tracking is needed — the gate simply blocks non-rage acts until rage fires.
 *
 * REQ-SUR-S2-01: ACTOR_SURPRISED is emitted by use-case gates that call isSurprisedFirstTurn.
 * REQ-SUR-S3-02: isSurpriseExempt gates the Feral Instinct carve-out in activate-rage.
 */

/**
 * Returns true if and only if the combatant is currently in the surprised+pre-first-turn state.
 *
 * PHB p.189: surprised combatant cannot act, bonus-act, or react until their first turn ends.
 * Gate predicate: surprised=true AND firstTurnActed=false.
 * NO round condition — a late-joining reinforcement with surprised=true is gated on their
 * first turn regardless of the current round (product assumption #2252.3, REQ-SUR-S1-04).
 *
 * Mirror of `isIncapacitated` — ACTOR-blocked polarity (ADR-2 engine-surprise-round1/design).
 * Pure domain function — no IO, no DB, no side effects.
 */
export function isSurprisedFirstTurn(surprised: boolean, firstTurnActed: boolean): boolean {
  return surprised && !firstTurnActed;
}

/**
 * Returns true if a Barbarian qualifies for the Feral Instinct surprise exemption.
 *
 * PHB p.50 — Feral Instinct (Barbarian):
 *   "By 7th level..." + "aren't incapacitated."
 *
 * Caller contract: this predicate is called ONLY when isSurprisedFirstTurn() is already true.
 * The caller passes:
 *   barbarianLevel — the combatant's total Barbarian class levels.
 *   isIncapacitated — whether the combatant currently has the Incapacitated condition.
 *
 * Honest-contract note (ADR-2): does NOT take `surprised`/`firstTurnActed` (gate already fired),
 * nor `ragedThisTurn` (the rage activation is the act being PERMITTED, not a precondition).
 *
 * Post-design #2256: no per-turn attempt tracking — rejected attempts are no-ops.
 * The caller does not need to track how many times the gate was checked; it only needs
 * to know whether THIS rage attempt is exempt.
 *
 * Pure domain function — no IO, no DB, no side effects.
 */
export function isSurpriseExempt(barbarianLevel: number, isIncapacitated: boolean): boolean {
  // PHB p.50: "By 7th level" — requires level 7 or higher AND not incapacitated.
  return barbarianLevel >= 7 && !isIncapacitated;
}
