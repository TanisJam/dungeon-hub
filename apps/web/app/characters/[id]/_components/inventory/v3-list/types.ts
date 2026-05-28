/**
 * Local UI types for the v3 inventory list.
 *
 * Re-exports web-side types from sheet-types; provides label maps and icon maps
 * for the TypeFilterChips and row rendering.
 *
 * Design DA4: V3ItemType + RarityClass live in sheet-types.ts (mirror of domain),
 * not re-declared here.
 */
export type { V3ItemType, RarityClass, EnrichedInventoryItem } from '@/lib/sheet-types';

/**
 * Filter keys: 'all' + each V3ItemType.
 */
export type FilterKey = 'all' | 'weapon' | 'armor' | 'consumable' | 'magic' | 'food' | 'trinket' | 'book' | 'quest';

/**
 * Group render order for v3 list (design §4 data-flow).
 * weapon → armor → magic → consumable → book → food → trinket → quest
 */
export const GROUP_ORDER: ReadonlyArray<Exclude<FilterKey, 'all'>> = [
  'weapon', 'armor', 'magic', 'consumable', 'book', 'food', 'trinket', 'quest',
] as const;

/**
 * Label map for chips + group heads.
 * "Todo" chip is the 'all' value.
 */
export const CHIP_LABELS: Record<FilterKey, string> = {
  all:        'Todo',
  weapon:     'Armas',
  armor:      'Armadura',
  magic:      'Mágicos',
  consumable: 'Consum.',
  food:       'Comida',
  trinket:    'Baratijas',
  book:       'Libros',
  quest:      'Quest',
};

/**
 * Icon map for chip buttons (text glyphs).
 */
export const CHIP_ICONS: Record<FilterKey, string> = {
  all:        '◈',
  weapon:     '⚔',
  armor:      '🛡',
  magic:      '✨',
  consumable: '⚗',
  food:       '🍖',
  trinket:    '◈',
  book:       '📖',
  quest:      '◎',
};

/**
 * Types where the filter chip is deferred to a future SDD.
 * DCE4 (Slice C): 'book' and 'quest' are now enabled. Empty set — no chips deferred.
 * Future SDDs can add new types here without changing the chips component.
 */
export const DEFERRED_TYPES: ReadonlySet<FilterKey> = new Set<FilterKey>();
