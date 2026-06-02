// REQ-CBROWSE-08: CompendiumCategory replaces CategoryId. Drops 'lore' (no API endpoint),
// adds 'backgrounds'. CategoryId is kept as an alias for the existing grid (reconciled in B1-1.3).
export type CompendiumCategory =
  | 'spells'
  | 'items'
  | 'races'
  | 'classes'
  | 'backgrounds'
  | 'monsters';

// CategoryId is now an alias — the 6-card grid still uses 'lore' as the disabled card.
// TODO #513: Once the backgrounds card is wired, CategoryId can be retired.
export type CategoryId =
  | 'spells'
  | 'items'
  | 'races'
  | 'classes'
  | 'backgrounds'
  | 'monsters'
  | 'lore';

export interface CategoryDef {
  id: CategoryId;
  name: string;
  icon: string;
  /** Modifier CSS class for tint (e.g. 'spell', 'lore') */
  cls: string;
}

export interface RecentDef {
  id: string;
  name: string;
  sub: string;
  icon: string;
  /** Modifier CSS class for row tint */
  cls: string;
}

// ---------------------------------------------------------------------------
// Spell API row shape (real Drizzle row from GET /compendium/spells and
// GET /compendium/spells/:slug). The `data` field is the raw 5etools JSONB.
// PHB 2014 p.201 — spell fields: time, range, components, duration, entries.
// ---------------------------------------------------------------------------

export interface SpellTimeEntry {
  number: number;
  unit: string;
  condition?: string;
}

export interface SpellRange {
  type: string;
  distance?: { type: string; amount?: number };
}

export interface SpellComponents {
  v?: boolean;
  s?: boolean;
  m?: string | { text: string; cost?: number };
  r?: boolean; // reaction component
}

export interface SpellDurationEntry {
  type: string;
  duration?: { type: string; amount?: number };
  concentration?: boolean;
}

export interface SpellData {
  time: SpellTimeEntry[];
  range: SpellRange;
  components: SpellComponents;
  duration: SpellDurationEntry[];
  entries: unknown[];
  [key: string]: unknown;
}

export interface SpellApiRow {
  slug: string;
  source: string;
  name: string;
  level: number;
  school: string;
  data: SpellData;
}

// ---------------------------------------------------------------------------
// Generic list-hit shapes (list endpoints return projected columns, not full data JSONB)
// ---------------------------------------------------------------------------

export interface SpellListHit {
  slug: string;
  source: string;
  name: string;
  level: number;
  school: string;
}
