// Per-category list-row renderer components. Each reads the projected list columns
// returned by the API list endpoint for that category.
// REQ-CBROWSE-03: required fields per category type.
// Mobile-first: min-height 44px tap target.

import type { SpellListHit } from '@/app/compendium/_components/types';

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
