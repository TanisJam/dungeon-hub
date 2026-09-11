import { AppShell } from '@/components/layout/app-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { Skeleton } from '@/components/ui';
import { HERRAMIENTAS_SUBNAV_ITEMS } from './_components/subnav-items';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const LIST_ROWS = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5'] as const;

/**
 * Loading state for the app/herramientas tree (audit F1, work unit 3) — this
 * boundary covers /herramientas/facciones, /npcs and /quests. /tienda and
 * /contenido override it with their own loading.tsx (see those files for
 * why). /herramientas/page.tsx itself is a bare redirect() to /facciones —
 * per the brief, no loading.tsx for a page that renders nothing.
 *
 * One boundary for the three list leaves, not lazy: read side by side,
 * facciones/page.tsx, npcs/page.tsx and quests/page.tsx (~90-110 lines each)
 * are the SAME shape end to end — AppShell title="Herramientas" subtitle=
 * "<SECTION>", SubNav (HERRAMIENTAS_SUBNAV_ITEMS), then a
 * *ClientWrapper around WorldEntityShell (components/world/_shell/
 * world-entity-shell.tsx:220-233): a sticky search input, then a
 * divide-y list of rows (ListRow, components/ui/list-row.tsx:33-63 — title
 * + trailing Pill, used by FactionRowView/NpcRow/etc.). Nothing about the
 * three leaves' content shape differs; only their subtitle text and API
 * calls do.
 *
 * subtitle is a <Skeleton> bar and SubNav gets activePath="" (no pill
 * highlighted): this shared file cannot know which of the three leaves
 * triggered it, so neither is guessed, same reasoning as
 * app/characters/loading.tsx.
 */
export default function HerramientasLoading() {
  return (
    <AppShell title="Herramientas" subtitle={<Skeleton className="h-2.5 w-20" />}>
      <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="" />

      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Herramientas"
        className="flex flex-col"
      >
        <Skeleton className="h-11 w-full" />
        <div className="mt-3 flex flex-col divide-y divide-line">
          {LIST_ROWS.map((row) => (
            <div key={row} className="flex items-center justify-between gap-2 py-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-5 w-14 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
