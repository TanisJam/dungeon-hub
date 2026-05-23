import type { Entry } from '@/components/compendium/types';

/**
 * The 11 kinds that have detail API endpoints in v1.
 * Unsupported kinds (variantrule, subclassFeature, classFeature, etc.) do NOT appear here.
 */
export type RefKind =
  | 'spell'
  | 'item'
  | 'creature'
  | 'condition'
  | 'status'
  | 'feat'
  | 'race'
  | 'class'
  | 'background'
  | 'action'
  | 'language';

/**
 * A compendium entry returned by the API — contains the data needed
 * to render the term hover card.
 */
export interface TermEntry {
  name: string;
  entries: Entry[];
  source: string;
  sourceCitation?: string;
}

/**
 * Discriminated union result of a term fetch operation.
 */
export type TermFetchResult =
  | { kind: 'ok'; entry: TermEntry }
  | { kind: 'error'; message: string };

/**
 * A single cache slot — a Promise so in-flight dedup is automatic:
 * two hovers on the same refKey share the same Promise reference.
 */
export type CacheEntry = Promise<TermFetchResult>;

/**
 * The in-memory fetch cache keyed by normalized refKey
 * (`${kind}:${slug}:${source}` all lowercased).
 */
export type Cache = Map<string, CacheEntry>;

/**
 * A dev-only mock resolver used by TermProvider's mockMode prop.
 * Receives the normalized refKey and returns a result (sync or async).
 */
export type MockResolver = (refKey: string) => TermFetchResult | Promise<TermFetchResult>;
