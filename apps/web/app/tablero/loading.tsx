import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const QUEST_ROWS = ['row-1', 'row-2', 'row-3', 'row-4'] as const;

/**
 * Loading state for /tablero (audit F1, work unit 3).
 *
 * title="Tablero" and subtitle="ANUNCIOS" are statically known — every
 * branch of page.tsx (no active character, no convocatorias, and the
 * success path, lines 79/106/117) uses the same pair.
 *
 * Content shape, read from page.tsx:116-124 + components/ui/quest-row.tsx
 * :26-53: a list of card-rows — icon cell, title + subtitle, trailing
 * chevron. The two empty-state branches are not represented, same reasoning
 * as the other list pages in this batch.
 */
export default function TableroLoading() {
  return (
    <AppShell title="Tablero" subtitle="ANUNCIOS">
      <ul
        role="status"
        aria-busy="true"
        aria-label="Cargando Tablero"
        className="mt-2 flex flex-col gap-2"
      >
        {QUEST_ROWS.map((row) => (
          <li key={row} className="flex items-center gap-3 rounded-md bg-surface-soft px-3 py-2.5">
            <Skeleton className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="mt-1 h-2.5 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
