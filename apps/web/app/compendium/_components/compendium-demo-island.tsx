'use client';

import { CompendiumSearchTrigger } from './compendium-search-trigger';

/**
 * CompendiumDemoIsland — client island for the search trigger.
 * SpellDetailSheet removed: no real spell-list/search UI exists yet on /compendium.
 * A real "open spell → detail" flow requires a spell-list/search feature (separate SDD).
 * The detail API (GET /compendium/spells/:slug) exists but has no caller here.
 */
export function CompendiumDemoIsland() {
  return (
    <CompendiumSearchTrigger onOpen={() => {/* TODO: open real search when spell-list feature lands */}} />
  );
}
