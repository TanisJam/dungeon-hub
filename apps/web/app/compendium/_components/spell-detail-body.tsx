// REQ-CBROWSE-08: SpellDetailBody refactored to accept the real API response shape.
// The old SpellDetail/SpellMeta types and paragraphs: string[] rendering are gone.
// Now composed as: SpellHeader (meta) + CompendiumEntriesWithTerms (description body).
// ADR-6: mandatory Batch 1 refactor before any live data is wired.

import { CompendiumEntriesWithTerms } from '@/components/compendium/term/CompendiumEntriesWithTerms';
import type { Entry } from '@/components/compendium/types';
import { SpellHeader } from './spell-header';
import type { SpellApiRow } from './types';

interface SpellDetailBodyProps {
  data: SpellApiRow;
  /** World UUID for CompendiumEntriesWithTerms hover-card term resolution. */
  worldId?: string | null;
  /** Supabase access token for CompendiumEntriesWithTerms. */
  accessToken?: string | null;
}

/**
 * SpellDetailBody — spell detail composed of SpellHeader + CompendiumEntriesWithTerms body.
 * REQ-CBROWSE-08: accepts the real Drizzle row shape (extracted cols + raw data JSONB).
 * REQ-CBROWSE-07: header renders all 6 PHB p.201–203 spell meta fields.
 *
 * The "Preparar" and "Favorito" ghost-button stubs are removed — they were demo stubs
 * (WCDS-CTA-04) not in V1 scope per ADR-6.
 */
export function SpellDetailBody({ data, worldId, accessToken }: SpellDetailBodyProps) {
  const entries = (data.data.entries ?? []) as Entry[];
  return (
    <div>
      <SpellHeader data={data} />
      <div className="desc mt-4">
        <CompendiumEntriesWithTerms
          entries={entries}
          worldId={worldId}
          accessToken={accessToken}
        />
      </div>
    </div>
  );
}
