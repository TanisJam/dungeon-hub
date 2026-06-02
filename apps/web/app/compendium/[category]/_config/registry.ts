// ADR-2: CATEGORY_CONFIG is the single typed registry that maps each CompendiumCategory
// to its per-type behavior (endpoint, label, RowView, Header, listHitType).
// This is the open/closed seam — Batch 2/3 add entries here without touching the route,
// list island, detail sheet, or Server Action.
//
// Batch 1 populates only 'spells'. Batch 2 adds items/races/classes/backgrounds.
// Batch 3 adds monsters.

import type { ComponentType } from 'react';
import type { CompendiumCategory } from '@/app/compendium/_components/types';
import { SpellHeader } from '@/app/compendium/_components/spell-header';
import { SpellRowView } from '../_components/row-views';

// ---------------------------------------------------------------------------
// CategoryConfig — per-category wiring contract
// ---------------------------------------------------------------------------

export interface CategoryConfig {
  /** API path segment: list = /compendium/{endpoint}, detail = /compendium/{endpoint}/:slug */
  endpoint: string;
  /** Display label (ES). */
  label: string;
  /** Per-category list-row renderer. Receives a raw list-hit row from the API. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RowView: ComponentType<{ row: any }>;
  /** Per-type detail header component. Receives the full Drizzle row (cols + data JSONB). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Header: ComponentType<{ data: any }>;
}

// ---------------------------------------------------------------------------
// Registry — Batch 1: spells only. Batch 2/3 will add the remaining entries.
// ---------------------------------------------------------------------------

export const CATEGORY_CONFIG: Record<CompendiumCategory, CategoryConfig> = {
  spells: {
    endpoint: 'spells',
    label: 'Hechizos',
    RowView: SpellRowView,
    Header: SpellHeader,
  },
  // Batch 2 entries — placeholders so the Record<CompendiumCategory, ...> type is satisfied.
  // These will be replaced with real implementations in Batch 2.
  items: {
    endpoint: 'items',
    label: 'Items',
    RowView: SpellRowView, // placeholder — replaced in Batch 2
    Header: SpellHeader,   // placeholder — replaced in Batch 2
  },
  races: {
    endpoint: 'races',
    label: 'Razas',
    RowView: SpellRowView,
    Header: SpellHeader,
  },
  classes: {
    endpoint: 'classes',
    label: 'Clases',
    RowView: SpellRowView,
    Header: SpellHeader,
  },
  backgrounds: {
    endpoint: 'backgrounds',
    label: 'Trasfondos',
    RowView: SpellRowView,
    Header: SpellHeader,
  },
  // Batch 3 entry — placeholder
  monsters: {
    endpoint: 'monsters',
    label: 'Monstruos',
    RowView: SpellRowView,
    Header: SpellHeader,
  },
};
