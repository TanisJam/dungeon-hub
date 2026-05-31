/**
 * decideConcentration — pure PHB p.203 concentration one-at-a-time rule helper.
 *
 * PHB p.203 — Concentration:
 *   "You lose concentration on a spell if you cast another spell that requires
 *    concentration."
 *   Only spells that REQUIRE concentration trigger the drop. Non-concentration
 *    spells cast while concentrating leave the active concentration entry untouched.
 *
 * Design ref: sdd/engine-concentration-authority/design — ADR-4 (pure helper lives
 * in packages/domain; no IO, no DB; the service in apps/api/use-cases/engine
 * consumes this for the transaction-level decision).
 *
 * Covers REQ-CONC-02 (one-at-a-time) and REQ-CONC-04 (non-concentration no-op).
 *
 * CRITICAL: domain pure — no IO, no DB, no fetch.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** The two stores that can hold concentration spells. */
export type ConcentrationStore = 'modifier_instances' | 'encounter_combatant_effects';

/**
 * An existing concentration entry for a caster — read from the
 * character_concentration registry row (by the API service layer) before
 * calling decideConcentration.
 */
export interface ConcentrationEntry {
  /** Which store holds the live effect rows for this concentration. */
  store: ConcentrationStore;
  /** The server-minted token linking the registry row to the store rows. */
  token: string;
  /** Human-readable spell name stored in the registry row. */
  spellName: string;
}

/**
 * The incoming spell the caster is about to cast.
 * requiresConcentration distinguishes concentration from non-concentration spells.
 */
export interface ConcentrationCandidate {
  /** Which store this cast's effect rows will land in. */
  store: ConcentrationStore;
  /** The server-minted token for this new cast. */
  token: string;
  /** Human-readable spell name for the new cast. */
  spellName: string;
  /**
   * Whether this spell requires concentration (PHB p.203).
   * Only concentration spells trigger the one-at-a-time drop.
   * Non-concentration spells return { noOp: true } regardless of prior state.
   */
  requiresConcentration: boolean;
}

/**
 * Result of decideConcentration.
 *
 * noOp branch: incoming spell does not require concentration — no change.
 * register branch: incoming spell requires concentration — register it, and
 *   optionally drop the prior concentration if one was active.
 *   dropPrior is absent (key omitted) when there was no prior entry, which
 *   satisfies exactOptionalPropertyTypes.
 */
export type ConcentrationDecision =
  | { noOp: true }
  | {
      /**
       * The prior concentration to drop, if one was active.
       * Key is absent (never undefined) when prior was null.
       */
      dropPrior?: { store: ConcentrationStore; token: string };
      /** The new concentration entry to register. */
      register: { store: ConcentrationStore; token: string; spellName: string };
    };

// ── decideConcentration ───────────────────────────────────────────────────────

/**
 * Applies the PHB p.203 one-concentration-at-a-time rule.
 *
 * Cases:
 *   1. incoming.requiresConcentration === false → { noOp: true }
 *      (PHB p.203: only concentration spells trigger the drop rule)
 *   2. prior === null, incoming is concentration → { register: { ... } }
 *      (no prior to drop; new entry registered cleanly)
 *   3. prior !== null, incoming is concentration → { dropPrior: { store, token }, register: { ... } }
 *      (prior is dropped; new entry registered — works across both stores, REQ-CONC-03)
 *
 * @param prior - The current concentration entry, or null if the caster is not concentrating.
 * @param incoming - The spell being cast.
 * @returns ConcentrationDecision
 */
export function decideConcentration(
  prior: ConcentrationEntry | null,
  incoming: ConcentrationCandidate,
): ConcentrationDecision {
  // PHB p.203: only spells that require concentration can displace or register.
  if (!incoming.requiresConcentration) {
    return { noOp: true };
  }

  const register = {
    store: incoming.store,
    token: incoming.token,
    spellName: incoming.spellName,
  } as const;

  if (prior === null) {
    // No existing concentration — new spell begins cleanly.
    return { register };
  }

  // Prior concentration exists — drop it (PHB p.203: "you lose concentration").
  // This covers same-store (REQ-CONC-02) and cross-store (REQ-CONC-03) equally
  // because the decision is uniform: the prior spell is always dropped.
  return {
    dropPrior: { store: prior.store, token: prior.token },
    register,
  };
}
