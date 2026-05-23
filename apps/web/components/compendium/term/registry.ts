import type { RefKind } from './types';

/**
 * The 11 ref kinds that have backend detail endpoints in v1.
 * Provider's hover handler short-circuits for any kind NOT in this set.
 */
export const SUPPORTED_KINDS: Set<string> = new Set<RefKind>([
  'spell',
  'item',
  'creature',
  'condition',
  'status',
  'feat',
  'race',
  'class',
  'background',
  'action',
  'language',
]);

/**
 * Maps singular ref kind (as found in data-compendium-ref) to the plural
 * URL path segment expected by the API.
 *
 * Irregulars: creature→monsters, status→conditions (both share the conditions endpoint).
 */
export const KIND_TO_PATH: Record<RefKind, string> = {
  spell: 'spells',
  item: 'items',
  creature: 'monsters',
  condition: 'conditions',
  status: 'conditions',
  feat: 'feats',
  race: 'races',
  class: 'classes',
  background: 'backgrounds',
  action: 'actions',
  language: 'languages',
};

/**
 * Parsed representation of a data-compendium-ref attribute value.
 */
export interface ParsedRef {
  kind: string;
  slug: string;
  source: string;
}

/**
 * Parse the pipe-delimited value of a `data-compendium-ref` attribute.
 * Format: `{kind}|{slug}|{source}` (source defaults to "PHB" if absent).
 * Returns null for any malformed input (empty kind, empty string, etc.).
 */
export function parseRefKey(raw: string): ParsedRef | null {
  if (!raw) return null;
  const parts = raw.split('|');
  const kind = parts[0] ?? '';
  if (!kind) return null;
  const slug = parts[1] ?? '';
  const source = (parts[2] && parts[2].length > 0) ? parts[2] : 'PHB';
  return { kind, slug, source };
}

/**
 * Produce the canonical cache key for a term fetch result.
 * Format: `${kind}:${slug}:${source}` — all lowercased so that
 * the same logical entity compares equal regardless of capitalization.
 *
 * The source is included so that PHB and XPHB variants of the same slug
 * are stored separately.
 */
export function normalizeRefKey(kind: string, slug: string, source: string): string {
  return `${kind.toLowerCase()}:${slug.toLowerCase()}:${source.toLowerCase()}`;
}
