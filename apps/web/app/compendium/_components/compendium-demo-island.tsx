'use client';

// REQ-BIB-SEARCH-01: the search trigger now opens the real cross-category search sheet
// instead of the honest-Link no-op from REQ-CBROWSE-10. This completes the original
// intent CompendiumSearchTrigger was scaffolded for ("opens the spell detail sheet") —
// it just took the real search implementation to make opening a sheet honest.

import { useState } from 'react';
import { CompendiumSearchTrigger } from './compendium-search-trigger';
import { CompendiumSearchSheet } from './compendium-search-sheet';

interface CompendiumDemoIslandProps {
  /** Active campaign UUID — threaded to the search sheet's scope. REQ-CBROWSE-05. */
  campaignId: string | null;
}

/**
 * CompendiumDemoIsland — client island hosting the Biblioteca search trigger + sheet.
 * REQ-BIB-SEARCH-01: tap-to-open (mobile-first §2), tap-outside/Escape-to-close via V3Sheet.
 */
export function CompendiumDemoIsland({ campaignId }: CompendiumDemoIslandProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CompendiumSearchTrigger onOpen={() => setOpen(true)} />
      <CompendiumSearchSheet open={open} onClose={() => setOpen(false)} campaignId={campaignId} />
    </>
  );
}
