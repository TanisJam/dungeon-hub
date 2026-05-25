/**
 * Long rest HP eligibility gate.
 *
 * PHB p.186 — Long Rest: "A character must have at least 1 hit point at the
 * start of the rest to gain its benefits."
 *
 * Temp HP (PHB p.198) is excluded — only hp.current is evaluated.
 * null HP means the character has not yet been initialized; eligibility is
 * deferred to the route-level auto-init path (read-path tolerance).
 */

export type LongRestEligibilityIssue = {
  code: 'LONG_REST_DOWNED';
  /** PHB p.186 minimum: at least 1 hit point */
  expected: 1;
  got: number;
};

export type LongRestEligibilityResult =
  | { ok: true }
  | { ok: false; issues: [LongRestEligibilityIssue] };

/**
 * Validates whether a character is eligible to start a long rest.
 *
 * @param currentHp - The character's current HP. Pass `null` when HP is
 *   uninitialized (legacy characters); such characters are allowed through
 *   so the route's HP auto-init path runs first.
 *
 * PHB p.186 — "A character must have at least 1 hit point at the start of
 * the rest to gain its benefits."
 */
export function validateLongRestEligibility(
  currentHp: number | null,
): LongRestEligibilityResult {
  // null = uninitialized → allow; auto-init happens in the route handler
  if (currentHp === null) {
    return { ok: true };
  }
  // PHB p.186: must have >= 1 HP
  if (currentHp >= 1) {
    return { ok: true };
  }
  return {
    ok: false,
    issues: [{ code: 'LONG_REST_DOWNED', expected: 1, got: currentHp }],
  };
}
