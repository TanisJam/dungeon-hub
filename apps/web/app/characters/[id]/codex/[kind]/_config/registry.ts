// CODEX_CATEGORY_CONFIG — per-kind wiring for the character-scoped codex browser.
//
// This registry is SEPARATE from CATEGORY_CONFIG (the global /compendium registry).
// Do NOT merge them — mixing concerns risks regressing the global compendium browser.
//
// Relationship to CATEGORY_CONFIG:
//   - Reuses the same RowView and Header components (no duplication of monster UI).
//   - Uses a different interface (CodexCategoryConfig vs CategoryConfig) to add
//     codex-specific fields: apiKind (→ /knowledge/:kind) and compendiumCategory (→ /compendium/:category/:slug detail).
//
// URL kind → DB kind mapping is handled by the API (read-character-codex.ts):
//   monsters (URL) → bestiary (DB character_knowledge.kind)
// The web layer only knows the URL kind ('monsters').
//
// ADR-4 (character-codex-browser design): CodexList imports this registry at module level.
// Do NOT pass RowView/Header as props across the RSC boundary — they are function components
// and cannot be serialized by Next.js.
//
// REQ-CCB-WEB-04 (spec character-codex-browser)

import type { ComponentType } from 'react';
import { MonsterRowView } from '@/app/compendium/[category]/_components/row-views';
import { MonsterStatblockHeader } from '@/app/compendium/[category]/_components/monster-statblock-header';
import { WorldEntityRowView, WorldEntityHeader } from '../_components/world-entity-views';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Valid codex kind URL params. Mirrors CodexKind on the API side.
 *
 * codex-knowledge B-1: expanded to all 5 world-knowledge kinds (design #1948 §4.1).
 * ADR-2 Option A (#1946): monsters fully wired; npcs/factions/locations/lore → gated-EMPTY from API.
 */
export type CodexKind = 'monsters' | 'npcs' | 'factions' | 'locations' | 'lore';

export interface CodexCategoryConfig {
  /**
   * URL kind for the knowledge list endpoint.
   * Maps to GET /characters/:id/knowledge/{apiKind}.
   * NOTE: apiKind 'monsters' → DB kind 'bestiary' (the seam lives in the API, not here).
   */
  apiKind: string;
  /**
   * Compendium category for the detail endpoint.
   * Maps to GET /compendium/{compendiumCategory}/:slug?world=&source=
   */
  compendiumCategory: string;
  /** Display label (ES). */
  label: string;
  /** Per-kind list-row renderer. Receives a raw row from /knowledge/:kind. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RowView: ComponentType<{ row: any }>;
  /** Per-kind detail header component. Receives the full row from /compendium/:category/:slug. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Header: ComponentType<{ data: any }>;
}

// ---------------------------------------------------------------------------
// Registry — Slice 1: monsters fully wired; npcs/factions/locations/lore stub (gated-EMPTY).
// codex-knowledge B-1, design #1948 §4.1, ADR-2 Option A (#1946).
// ---------------------------------------------------------------------------

export const CODEX_CATEGORY_CONFIG: Record<CodexKind, CodexCategoryConfig> = {
  monsters: {
    apiKind: 'monsters',
    compendiumCategory: 'monsters',
    label: 'Monstruos',
    RowView: MonsterRowView,
    Header: MonsterStatblockHeader,
  },
  // gated-EMPTY in Slice 1 — API returns { rows: [], total: 0 } for these kinds.
  // TODO: wire UUID-based resolver in follow-up slice (codex-knowledge #1946).
  npcs: {
    apiKind: 'npcs',
    compendiumCategory: 'npcs',
    label: 'PNJs',
    RowView: WorldEntityRowView,
    Header: WorldEntityHeader,
  },
  factions: {
    apiKind: 'factions',
    compendiumCategory: 'factions',
    label: 'Facciones',
    RowView: WorldEntityRowView,
    Header: WorldEntityHeader,
  },
  locations: {
    apiKind: 'locations',
    compendiumCategory: 'locations',
    label: 'Lugares',
    RowView: WorldEntityRowView,
    Header: WorldEntityHeader,
  },
  lore: {
    apiKind: 'lore',
    compendiumCategory: 'lore',
    label: 'Tradición',
    RowView: WorldEntityRowView,
    Header: WorldEntityHeader,
  },
};
