/**
 * Knowledge tag vocabulary — canonical cross-surface constant.
 *
 * // TODO #513: intermediate domain constant pending DB-as-runtime-SoT migration.
 * // Until then this hardcoded vocabulary is the single domain source of truth for
 * // knowledge tags shared across Bitácora-personal and Bitácora-gremio (later waves).
 * // When DB-as-runtime-SoT lands, project from rules_profile (DB-backed resolver).
 *
 * ADR-4 (Biblioteca W1): REQ-TAGVOCAB-01.
 * No PHB rule applies — this is pure IA vocabulary.
 *
 * NOTE: `items` is in the tag vocabulary but is NOT a Biblioteca UI category (#1966).
 * Items belong to the Mercado wave (W2). The tag exists here so future Bitácora-personal
 * notes can tag item references; Biblioteca's UI simply does not list it as a category.
 */

export const KNOWLEDGE_TAGS = [
  'monsters',
  'locations',
  'npcs',
  'factions',
  'lore',
  'items',
  'spells',
] as const;

export type KnowledgeTag = typeof KNOWLEDGE_TAGS[number];

/**
 * Runtime type guard for KnowledgeTag.
 * Returns true if `v` is one of the canonical knowledge tag slugs.
 */
export function isKnowledgeTag(v: string): v is KnowledgeTag {
  return (KNOWLEDGE_TAGS as readonly string[]).includes(v);
}
