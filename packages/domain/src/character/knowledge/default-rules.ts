/**
 * Character knowledge default rules — pure domain functions.
 *
 * REQ-CK-GATE-01, REQ-CK-GATE-02 (spec #1626)
 *
 * HOUSE RULE — Bestiary statblock gating:
 *   RAW (PHB p.177-179) has no per-character statblock gate. Hiding a statblock
 *   per character is an intentional platform divergence for anti-metagaming.
 *   Per CLAUDE.md §1.1 this is explicitly a house rule.
 *
 * These functions are pure (no IO, no DB, no fetch). They accept all inputs
 * and return deterministic results. Wave 2 will add isItemKnownByDefault()
 * using the same export pattern without breaking callers.
 */

/**
 * Whether a monster is "known by default" without an explicit character_knowledge row.
 *
 * HOUSE RULE: Always false. Bestiary has NO default — the DM must grant every
 * monster explicitly. This is the anti-metagaming invariant for S1.
 * (Wave 2 items will have rarity-based defaults; monsters do not.)
 */
export function isMonsterKnownByDefault(): false {
  return false;
}

/**
 * Layered visibility gate — determines if a character can see a Codex entry.
 *
 * HOUSE RULE layered gate (REQ-CK-GATE-01):
 *   Layer 1 (world-visibility): DM bypasses everything. Player: entry must not be DM-secret.
 *   Layer 2 (knowledge gate): player needs a knowledge row OR a default rule to apply.
 *
 * @param view         - 'dm' bypasses both layers; 'player' goes through both.
 * @param isSecret     - True if the entry is DM-secret (hidden from all players).
 * @param knows        - True if character_knowledge row exists for this entry.
 * @param defaulted    - True if a default rule (e.g. item rarity) grants visibility.
 * @returns            - Whether the character can see the entry.
 */
export function seesEntry(
  view: 'dm' | 'player',
  isSecret: boolean,
  knows: boolean,
  defaulted: boolean,
): boolean {
  // DM bypasses all gates
  if (view === 'dm') return true;

  // Layer 1: DM-secret entries are never visible to players
  if (isSecret) return false;

  // Layer 2: player needs an explicit knowledge row or a default rule
  return knows || defaulted;
}
