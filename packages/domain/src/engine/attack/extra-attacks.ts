/**
 * extraAttacksPerAction — per-turn weapon-attack allowance for the engine.
 *
 * REQ-AE-08: pure derivation of total attacks per Attack action from class levels.
 * REQ-AE-02: isActionAvailable predicate (one action per turn — PHB p.189).
 * REQ-AE-03: isBonusActionAvailable predicate (one bonus action per turn — PHB p.189).
 *
 * PHB p.198 Extra Attack table (Fighter specifically listed; Sage Advice on multiclass):
 *   "If you gain the Extra Attack feature from more than one class, the features
 *   don't add together." — use MAX across classes, never sum.
 *
 * Design ref: sdd/engine-action-economy/design — ADR-2.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Minimal class descriptor required by extraAttacksPerAction.
 *
 * Structurally compatible with AppliedClass from packages/domain/src/character/class/types.ts
 * (which has slug + level + more fields). The fn declares its own narrow interface so
 * packages/domain/src/engine stays decoupled from the full character/class type.
 */
export interface ClassWithLevel {
  slug: string;
  level: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Classes whose Extra Attack scales beyond L5 (Fighter only, PHB p.72).
 * Fighter thresholds: L5→2, L11→3, L20→4.
 */
const FIGHTER_SLUG = 'fighter';

/**
 * Classes that gain Extra Attack at L5 with NO further scaling.
 * PHB p.49 (Barbarian), p.84 (Paladin), p.89 (Ranger).
 */
const MARTIAL_L5_SLUGS: ReadonlySet<string> = new Set(['barbarian', 'paladin', 'ranger']);

// ── extraAttacksPerAction ─────────────────────────────────────────────────────

/**
 * Returns the total number of weapon attacks granted by ONE Attack action this turn.
 *
 * Pure — no IO, no DB, no RNG. Returns 1 for non-martial classes or below-threshold
 * levels; returns the PHB-table value for Extra Attack classes.
 *
 * Multiclass rule (Sage Advice / PHB p.198): take the MAX across classes that grant
 * Extra Attack. Do NOT stack them.
 *
 * @param classes - Array of classes the combatant has (slug + level pairs).
 *   Pass an empty array for NPCs or classless combatants → returns 1 (defensive).
 * @returns Total weapon attacks per Attack action (≥ 1).
 */
export function extraAttacksPerAction(classes: readonly ClassWithLevel[]): number {
  if (classes.length === 0) return 1;

  let max = 1;

  for (const { slug, level } of classes) {
    const attacks = attacksForClass(slug, level);
    if (attacks > max) max = attacks;
  }

  return max;
}

/**
 * Derives the attacks-per-Attack-action for a single class at a given level.
 * Returns 1 for classes that don't grant Extra Attack.
 */
function attacksForClass(slug: string, level: number): number {
  if (slug === FIGHTER_SLUG) {
    // PHB p.72: Extra Attack (L5), Extra Attack 2 (L11), Extra Attack 3 (L20).
    if (level >= 20) return 4;
    if (level >= 11) return 3;
    if (level >= 5) return 2;
    return 1;
  }

  if (MARTIAL_L5_SLUGS.has(slug)) {
    // PHB p.49/p.84/p.89: Extra Attack at 5th level, no further scaling.
    return level >= 5 ? 2 : 1;
  }

  // Monk Extra Attack (PHB p.79) IS granted at L5 — known compliance gap, DEFERRED.
  // See engram sdd/engine-barbarian-dsl-4. Wizard/Cleric/Rogue genuinely do not grant it.
  return 1;
}

// ── Budget predicates ─────────────────────────────────────────────────────────

/**
 * Returns true when the combatant's action has NOT been used this turn.
 *
 * PHB p.189: each combatant has exactly one action per turn.
 * Use-cases should call this BEFORE accepting an action-cost request.
 *
 * REQ-AE-02 — Design ref: sdd/engine-action-economy/design — ADR-2.
 *
 * @param actionUsed - The current value of action_used from the DB row.
 */
export function isActionAvailable(actionUsed: boolean): boolean {
  return !actionUsed;
}

/**
 * Returns true when the combatant's bonus action has NOT been used this turn.
 *
 * PHB p.189: each combatant has exactly one bonus action per turn.
 * Use-cases should call this BEFORE accepting a bonus-action-cost request.
 *
 * REQ-AE-03 — Design ref: sdd/engine-action-economy/design — ADR-2.
 *
 * @param bonusActionUsed - The current value of bonus_action_used from the DB row.
 */
export function isBonusActionAvailable(bonusActionUsed: boolean): boolean {
  return !bonusActionUsed;
}
