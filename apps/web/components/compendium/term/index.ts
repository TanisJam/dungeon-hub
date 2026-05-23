/**
 * Public API for the compendium term hover system.
 *
 * Main entry points:
 * - `CompendiumEntriesWithTerms` — ergonomic wrapper for pages/layouts
 * - `TermProvider` — low-level provider for custom composition
 * - `createMockResolver` — dev/test mock factory
 * - `mockKey` — helper to build normalized fixture keys
 *
 * Internal components (Term, TermCard) are intentionally NOT exported —
 * they are implementation details of TermProvider.
 */

// ---- Components ----
export { CompendiumEntriesWithTerms } from './CompendiumEntriesWithTerms';
export type { CompendiumEntriesWithTermsProps } from './CompendiumEntriesWithTerms';

export { TermProvider } from './TermProvider';
export type { TermProviderProps } from './TermProvider';

// ---- Mock utilities (dev / test) ----
export { createMockResolver, mockKey } from './mock';

// ---- Public types ----
export type {
  RefKind,
  TermEntry,
  TermFetchResult,
  MockResolver,
} from './types';
