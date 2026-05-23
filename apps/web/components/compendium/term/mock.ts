import type { MockResolver, TermFetchResult } from './types';
import { normalizeRefKey } from './registry';

/**
 * Factory that creates a MockResolver from a fixtures map keyed by
 * normalized refKey (`${kind}:${slug}:${source}` all lowercased).
 *
 * Usage:
 * ```ts
 * const resolver = createMockResolver({
 *   'spell:fireball:phb': { kind: 'ok', entry: { name: 'Fireball', ... } },
 *   'condition:prone:phb': { kind: 'ok', entry: { name: 'Prone', ... } },
 * });
 * ```
 *
 * When the refKey is not found in fixtures, returns an error result instead
 * of throwing — keeps dev preview graceful for partial fixture sets.
 */
export function createMockResolver(
  fixtures: Record<string, TermFetchResult>,
): MockResolver {
  return function mockResolver(refKey: string): TermFetchResult {
    // refKey is already normalized by TermProvider (kind:slug:source lowercased)
    const result = fixtures[refKey];
    if (result !== undefined) {
      return result;
    }

    // Graceful fallback: entry not in fixtures
    return {
      kind: 'error',
      message: `[mock] No fixture for refKey "${refKey}"`,
    };
  };
}

// ---------------------------------------------------------------------------
// Convenience: build a normalized fixture key from parts
// ---------------------------------------------------------------------------

/**
 * Helper to construct a fixture map key from parts (same normalization
 * as the provider cache key). Use when building fixtures inline.
 *
 * ```ts
 * const fixtures = {
 *   [mockKey('spell', 'fireball', 'PHB')]: { kind: 'ok', entry: ... },
 * };
 * ```
 */
export function mockKey(kind: string, slug: string, source: string): string {
  return normalizeRefKey(kind, slug, source);
}
