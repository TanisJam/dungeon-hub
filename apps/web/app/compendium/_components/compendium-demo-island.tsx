'use client';

import { useState } from 'react';
import { CompendiumSearchTrigger } from './compendium-search-trigger';
import { CompendiumRecentsList } from './compendium-recents-list';
import { SpellDetailSheet } from './spell-detail-sheet';

/**
 * CompendiumDemoIsland — client island that lifts `openDetail` state.
 * WCDS-OPEN-02 / WCP-SEARCH-06: both search trigger and Fireball row share the same boolean.
 * Design §2 D1: single controller for two triggers + one sheet.
 */
export function CompendiumDemoIsland() {
  const [openDetail, setOpenDetail] = useState(false);

  return (
    <>
      <CompendiumSearchTrigger onOpen={() => setOpenDetail(true)} />
      <CompendiumRecentsList onOpenFireball={() => setOpenDetail(true)} />
      <SpellDetailSheet open={openDetail} onClose={() => setOpenDetail(false)} />
    </>
  );
}
