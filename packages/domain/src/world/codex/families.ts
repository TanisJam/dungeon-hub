/**
 * Codex category→family routing split.
 *
 * FORK 2 (#1944): Reference categories are always visible; world-knowledge
 * categories are gated by character_knowledge (anti-metagaming).
 *
 * Keys are the WEB category slugs (e.g. 'monsters', not DB 'bestiary').
 * The 'monsters→bestiary' DB seam stays in read-character-codex.ts KIND_TO_DB_KIND —
 * do NOT duplicate it here.
 *
 * // TODO #513: project from DB rules_profile when DB-as-runtime-SoT lands.
 * // OQ1 resolution (#1946): constant + TODO #513 for now.
 *
 * REQ-CK-GATE-01, REQ-CK-DOMAIN-01, REQ-CK-DOMAIN-04.
 */

export type CodexFamily = 'reference' | 'world-knowledge';

/**
 * Single source of truth for category→family mapping.
 * Importable from @dungeon-hub/domain so web and API layers share it.
 *
 * Do NOT add per-component if/else duplicating this mapping (REQ-CK-GATE-01).
 *
 * // TODO #513: project from DB rules_profile when DB-as-runtime-SoT lands.
 */
export const CATEGORY_FAMILY: Record<string, CodexFamily> = {
  // Reference: always visible (PHB/SRD — player owns the manual). FORK 2 (#1944).
  spells: 'reference',
  items: 'reference',
  classes: 'reference',
  races: 'reference',
  backgrounds: 'reference',
  feats: 'reference',
  conditions: 'reference',
  // World-knowledge: gated by character_knowledge. Anti-metagaming. FORK 2 (#1944).
  monsters: 'world-knowledge',
  npcs: 'world-knowledge',
  factions: 'world-knowledge',
  locations: 'world-knowledge',
  lore: 'world-knowledge',
};

/**
 * Returns the family for a codex category slug, or null if unknown.
 *
 * Returns null for unrecognized slugs — callers that need validation
 * should check for null and return 400 INVALID_KIND (REQ-CK-GATE-04).
 */
export function familyOf(category: string): CodexFamily | null {
  return CATEGORY_FAMILY[category] ?? null;
}
