'use client';

import {
  CompendiumEntriesWithTerms,
  createMockResolver,
} from '@/components/compendium/term';
import { TERM_FIXTURES, TERM_DEMO_ENTRIES } from './term-fixtures';

export function TermHoverDemo() {
  return (
    <CompendiumEntriesWithTerms
      entries={TERM_DEMO_ENTRIES}
      worldId="dev-preview"
      accessToken="mock-token"
      mockMode={createMockResolver(TERM_FIXTURES)}
    />
  );
}
