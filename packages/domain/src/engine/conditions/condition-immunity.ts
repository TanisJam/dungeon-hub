/**
 * isImmuneToCondition — pure condition-immunity predicate.
 *
 * REQ-RI-12..17 / ADR-7
 *
 * PHB p.291 — Petrified:
 *   "The creature is immune to poison and disease, although a poison or disease
 *    already in its system is suspended, not neutralized."
 *
 * Returns true when the activeConditions list contains a condition that
 * grants immunity to conditionName.
 *
 * Immunity map:
 *   Petrified → ['Poisoned']
 *   (extensible — add entries as new conditions land per their PHB text)
 *
 * This is data-driven hardcoded for now.
 * // TODO #513: immunity map → DB-injected resolver per §1.2.
 *
 * Pure function: no IO, no DB, no side effects.
 * Design ref: sdd/engine-resist-immunity/design — ADR-7.
 */

// ── Condition immunity map ────────────────────────────────────────────────────

/**
 * Hardcoded immunity map: conditionName → conditions that grant immunity to it.
 *
 * Key   = the condition being APPLIED (e.g. 'Poisoned').
 * Value = list of active conditions that grant immunity to the key (e.g. ['Petrified']).
 *
 * Usage: "If any active condition is in grantors[], the application is immune."
 * // TODO #513: migrate to DB-injected resolver when reference data migrates.
 */
const CONDITION_IMMUNITY_MAP: Record<string, string[]> = {
  // PHB p.291: Petrified creature is immune to the Poisoned condition
  Poisoned: ['Petrified'],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns true when any active condition grants immunity to the incoming condition.
 *
 * @param activeConditions - Current conditions on the target (e.g. [{ name: 'Petrified' }]).
 * @param conditionName    - The condition being applied (e.g. 'Poisoned').
 * @returns true if the target is immune to conditionName; false otherwise.
 */
export function isImmuneToCondition(
  activeConditions: { name: string }[],
  conditionName: string,
): boolean {
  const grantors = CONDITION_IMMUNITY_MAP[conditionName];

  if (grantors === undefined || grantors.length === 0) {
    // No immunity mapping for this condition — not immune
    return false;
  }

  const activeNames = new Set(activeConditions.map((c) => c.name));
  return grantors.some((grantor) => activeNames.has(grantor));
}
