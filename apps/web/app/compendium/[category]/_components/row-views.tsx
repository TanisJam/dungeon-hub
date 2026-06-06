// Per-category list-row renderer components. Each reads the projected list columns
// returned by the API list endpoint for that category.
// REQ-CBROWSE-03: required fields per category type.
// Mobile-first: min-height 44px tap target.

import type { SpellListHit } from '@/app/compendium/_components/types';

// ---------------------------------------------------------------------------
// Batch 2 list-hit types (projected columns from API list endpoints)
// ---------------------------------------------------------------------------

export interface ItemListHit {
  slug: string;
  source: string;
  name: string;
  type: string | null;
  weight: string | null;
  costCp: number | null;
}

export interface RaceListHit {
  slug: string;
  source: string;
  name: string;
  isSubrace: boolean;
  parentSlug: string | null;
  parentSource: string | null;
}

export interface ClassListHit {
  slug: string;
  source: string;
  name: string;
}

export interface BackgroundListHit {
  slug: string;
  source: string;
  name: string;
}

// Feats list projection: GET /compendium/feats → slug, source, name, prerequisites.
// prerequisites is the raw 5etools `prerequisite` array (or null). PHB p.165.
export interface FeatListHit {
  slug: string;
  source: string;
  name: string;
  prerequisites: unknown;
}

// Conditions list projection: GET /compendium/conditions → slug, source, name, kind.
// kind: 'condition' (Blinded, Charmed, …) | 'status' (Concentration, Surprised). PHB p.290.
export interface ConditionListHit {
  slug: string;
  source: string;
  name: string;
  kind: 'condition' | 'status';
}

// ---------------------------------------------------------------------------
// Batch 3: Monster list-hit type (projected columns from GET /compendium/monsters)
// ---------------------------------------------------------------------------

export interface MonsterListHit {
  slug: string;
  source: string;
  name: string;
  cr: string | null;
  crNumeric: string | null;
  type: string | null;
  size: string | null;
}

// ---------------------------------------------------------------------------
// School abbreviation → label (PHB 2014 p.203)
// ---------------------------------------------------------------------------
const SCHOOL_ABBR: Record<string, string> = {
  A: 'Abj',
  C: 'Con',
  D: 'Adiv',
  E: 'Evoc',
  I: 'Ilus',
  N: 'Nec',
  T: 'Trans',
  EN: 'Enc',
};

function schoolChip(code: string): string {
  return SCHOOL_ABBR[code] ?? code;
}

// ---------------------------------------------------------------------------
// SpellRowView — REQ-CBROWSE-03: name, level, school
// ---------------------------------------------------------------------------

export function SpellRowView({ row }: { row: SpellListHit }) {
  const levelLabel = row.level === 0 ? 'Truco' : `Nv. ${row.level}`;
  return (
    <div className="flex min-h-[44px] items-center gap-3 py-2">
      <div className="flex min-w-[3rem] flex-col items-center">
        <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold text-ink-soft">
          {levelLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-ink">{row.name}</span>
        <span className="text-xs text-ink-soft">{schoolChip(row.school)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemRowView — REQ-CBROWSE-03: name + type
// Items list projection includes: slug, source, name, type, weight, costCp
// ---------------------------------------------------------------------------

// PHB p.144-150 item type codes → readable labels
export const ITEM_TYPE_LABELS: Record<string, string> = {
  A: 'Armor',
  AT: 'Artisan Tool',
  EXP: 'Explosive',
  FD: 'Food/Drink',
  G: 'Gear',
  GS: 'Gaming Set',
  GV: 'Generic Variant',
  HA: 'Heavy Armor',
  INS: 'Instrument',
  LA: 'Light Armor',
  M: 'Melee Weapon',
  MA: 'Medium Armor',
  MNT: 'Mount',
  OTH: 'Other',
  P: 'Potion',
  R: 'Ranged Weapon',
  RD: 'Rod',
  RG: 'Ring',
  S: 'Shield',
  SC: 'Scroll',
  SCF: 'Spellcasting Focus',
  SHP: 'Vehicle',
  T: 'Tool',
  TAH: 'Tack/Harness',
  TG: 'Trade Good',
  VEH: 'Vehicle',
  WD: 'Wand',
};

function itemTypeLabel(code: string | null): string {
  if (!code) return '—';
  return ITEM_TYPE_LABELS[code] ?? code;
}

export function ItemRowView({ row }: { row: ItemListHit }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 py-2">
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-ink">{row.name}</span>
        <span className="text-xs text-ink-soft">{itemTypeLabel(row.type)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RaceRowView — REQ-CBROWSE-03: name (+ subrace note if isSubrace)
// ---------------------------------------------------------------------------

export function RaceRowView({ row }: { row: RaceListHit }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 py-2">
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-ink">{row.name}</span>
        {row.isSubrace && row.parentSlug && (
          <span className="text-xs text-ink-soft capitalize">{row.parentSlug}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClassRowView — REQ-CBROWSE-03: name
// ---------------------------------------------------------------------------

export function ClassRowView({ row }: { row: ClassListHit }) {
  return (
    <div className="flex min-h-[44px] items-center py-2">
      <span className="text-sm font-medium text-ink">{row.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BackgroundRowView — REQ-CBROWSE-03: name
// ---------------------------------------------------------------------------

export function BackgroundRowView({ row }: { row: BackgroundListHit }) {
  return (
    <div className="flex min-h-[44px] items-center py-2">
      <span className="text-sm font-medium text-ink">{row.name}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonsterRowView — REQ-CBROWSE-03: name, CR, type
// Monsters list projection: slug, source, name, cr, crNumeric, type, size
// ---------------------------------------------------------------------------

export function MonsterRowView({ row }: { row: MonsterListHit }) {
  const crLabel = row.cr ? `CR ${row.cr}` : '—';
  const typeLabel = row.type
    ? `${row.type.charAt(0).toUpperCase()}${row.type.slice(1)}`
    : '—';
  return (
    <div className="flex min-h-[44px] items-center gap-3 py-2">
      <div className="flex min-w-[3.5rem] flex-col items-center">
        <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-semibold text-ink-soft">
          {crLabel}
        </span>
      </div>
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-ink">{row.name}</span>
        <span className="text-xs text-ink-soft capitalize">{typeLabel}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feat prerequisites formatter (shared by FeatRowView + FeatHeader)
// Raw 5etools `prerequisite` shape (PHB feats use only these keys):
//   [{ ability: [{ dex: 13 }] }]         → "DES 13"
//   [{ ability: [{ int: 13 }, { wis: 13 }] }] → "INT 13 o SAB 13"  (intra-entry = OR)
//   [{ spellcasting: true }]             → "Saber lanzar conjuros"
//   [{ proficiency: [{ armor: 'medium' }] }] → "Competencia: armadura media"
// Multiple top-level entries are alternative requirement sets → joined with "; ".
// PHB p.165 — "Prerequisite. … you can take it only if you meet the prerequisite."
// ---------------------------------------------------------------------------

const ABILITY_ES_ABBR: Record<string, string> = {
  str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

const ARMOR_ES: Record<string, string> = {
  light: 'armadura ligera', medium: 'armadura media', heavy: 'armadura pesada',
};

export function formatPrerequisites(prerequisites: unknown): string | null {
  if (!Array.isArray(prerequisites) || prerequisites.length === 0) return null;
  const parts: string[] = [];
  for (const entry of prerequisites) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const sub: string[] = [];
    if (Array.isArray(e.ability)) {
      const opts: string[] = [];
      for (const ab of e.ability as Array<Record<string, number>>) {
        for (const [k, v] of Object.entries(ab)) {
          opts.push(`${ABILITY_ES_ABBR[k] ?? k.toUpperCase()} ${v}`);
        }
      }
      if (opts.length > 0) sub.push(opts.join(' o '));
    }
    if (e.spellcasting === true) sub.push('Saber lanzar conjuros');
    if (Array.isArray(e.proficiency)) {
      for (const prof of e.proficiency as Array<Record<string, string>>) {
        if (typeof prof.armor === 'string') {
          sub.push(`Competencia: ${ARMOR_ES[prof.armor] ?? prof.armor}`);
        } else if (typeof prof.weapon === 'string') {
          sub.push(`Competencia: armas ${prof.weapon}`);
        }
      }
    }
    if (sub.length > 0) parts.push(sub.join(', '));
  }
  return parts.length > 0 ? parts.join('; ') : null;
}

// ---------------------------------------------------------------------------
// FeatRowView — name + prerequisite hint (only when present, like RaceRowView).
// PHB p.165 — feats are an optional rule; prerequisites gate availability.
// ---------------------------------------------------------------------------

export function FeatRowView({ row }: { row: FeatListHit }) {
  const prereq = formatPrerequisites(row.prerequisites);
  return (
    <div className="flex min-h-[44px] items-center gap-3 py-2">
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-ink">{row.name}</span>
        {prereq && <span className="text-xs text-ink-soft">Requisito: {prereq}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConditionRowView — name + kind chip (Condición / Estado). PHB p.290 (Appendix A).
// ---------------------------------------------------------------------------

export function ConditionRowView({ row }: { row: ConditionListHit }) {
  const kindLabel = row.kind === 'status' ? 'Estado' : 'Condición';
  return (
    <div className="flex min-h-[44px] items-center gap-3 py-2">
      <div className="flex flex-1 flex-col">
        <span className="text-sm font-medium text-ink">{row.name}</span>
        <span className="text-xs text-ink-soft">{kindLabel}</span>
      </div>
    </div>
  );
}
