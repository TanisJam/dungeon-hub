'use client';

import { CompendiumEntries } from '@/components/compendium';
import { TermProvider } from './TermProvider';
import type { MockResolver } from './types';
import type { Entry } from '@/components/compendium/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CompendiumEntriesWithTermsProps {
  /** Raw compendium entries to render via <CompendiumEntries />. */
  entries: Entry[] | null | undefined;
  /** Campaign UUID passed through to TermProvider for API auth. */
  campaignId: string | null | undefined;
  /** Bearer access token. When absent/empty, all refs are inert. */
  accessToken: string | null | undefined;
  /** API base URL. Defaults to env.API_URL (NEXT_PUBLIC_API_URL). */
  apiBaseUrl?: string;
  /** Dev-only mock resolver. When provided, bypasses fetchTermEntry. */
  mockMode?: false | MockResolver;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Ergonomic client wrapper that renders <CompendiumEntries> inside
 * <TermProvider>, enabling inline term hover cards.
 *
 * Usage (production):
 * ```tsx
 * <CompendiumEntriesWithTerms
 *   entries={entry.entries}
 *   campaignId={character.campaignId}
 *   accessToken={session.access_token}
 * />
 * ```
 *
 * Usage (dev preview / tests):
 * ```tsx
 * <CompendiumEntriesWithTerms
 *   entries={entries}
 *   campaignId="mock"
 *   accessToken="mock"
 *   mockMode={createMockResolver(fixtures)}
 * />
 * ```
 */
export function CompendiumEntriesWithTerms({
  entries,
  campaignId,
  accessToken,
  apiBaseUrl,
  mockMode,
}: CompendiumEntriesWithTermsProps) {
  return (
    <TermProvider
      campaignId={campaignId}
      accessToken={accessToken}
      apiBaseUrl={apiBaseUrl}
      mockMode={mockMode}
    >
      <CompendiumEntries entries={entries} />
    </TermProvider>
  );
}
