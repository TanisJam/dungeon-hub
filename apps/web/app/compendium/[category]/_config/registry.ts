// ADR-2: CATEGORY_CONFIG is the single typed registry that maps each CompendiumCategory
// to its per-type behavior (endpoint, label, RowView, Header, listHitType).
// This is the open/closed seam — Batch 2/3 add entries here without touching the route,
// list island, detail sheet, or Server Action.
//
// Batch 1: spells. Batch 2: items, races, classes, backgrounds. Batch 3: monsters.

import type { ComponentType } from 'react';
import type { CompendiumCategory } from '@/app/compendium/_components/types';
import { SpellHeader } from '@/app/compendium/_components/spell-header';
import { SpellRowView, ItemRowView, RaceRowView, ClassRowView, BackgroundRowView, MonsterRowView, FeatRowView, ConditionRowView } from '../_components/row-views';
import { ItemHeader } from '../_components/item-header';
import { RaceHeader } from '../_components/race-header';
import { ClassHeader } from '../_components/class-header';
import { BackgroundHeader } from '../_components/background-header';
import { MonsterStatblockHeader } from '../_components/monster-statblock-header';
import { FeatHeader } from '../_components/feat-header';
import { ConditionHeader } from '../_components/condition-header';

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
// Registry — all 6 categories have real RowView + Header (Batches 1–3 complete).
// Adding a category = one entry here (the open/closed seam).
// ---------------------------------------------------------------------------

export const CATEGORY_CONFIG: Record<CompendiumCategory, CategoryConfig> = {
  spells: {
    endpoint: 'spells',
    label: 'Hechizos',
    RowView: SpellRowView,
    Header: SpellHeader,
  },
  items: {
    endpoint: 'items',
    label: 'Items',
    RowView: ItemRowView,
    Header: ItemHeader,
  },
  races: {
    endpoint: 'races',
    label: 'Razas',
    RowView: RaceRowView,
    Header: RaceHeader,
  },
  classes: {
    endpoint: 'classes',
    label: 'Clases',
    RowView: ClassRowView,
    Header: ClassHeader,
  },
  backgrounds: {
    endpoint: 'backgrounds',
    label: 'Trasfondos',
    RowView: BackgroundRowView,
    Header: BackgroundHeader,
  },
  // Batch 3 — real MonsterStatblockHeader + MonsterRowView (no more placeholders)
  monsters: {
    endpoint: 'monsters',
    label: 'Monstruos',
    RowView: MonsterRowView,
    Header: MonsterStatblockHeader,
  },
  // P5 (#3.3) — feats + conditions browser. API+DB already existed; this is web wiring only.
  feats: {
    endpoint: 'feats',
    label: 'Dotes',
    RowView: FeatRowView,
    Header: FeatHeader,
  },
  conditions: {
    endpoint: 'conditions',
    label: 'Estados',
    RowView: ConditionRowView,
    Header: ConditionHeader,
  },
};
