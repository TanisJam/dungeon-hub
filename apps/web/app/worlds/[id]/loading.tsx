import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const STATUS_TABS = ['pendientes', 'activos', 'todos'] as const;
const CHARACTER_ROWS = ['row-1', 'row-2', 'row-3'] as const;

/**
 * Loading state for /worlds/[id] (audit F1, work unit 3) — dynamic route.
 *
 * The world name is unknown while loading, so title is a <Skeleton> bar
 * (world.name, page.tsx:95). subtitle="PANEL DE MAESTRO" is statically known.
 * constructorHref and callerRole both need the resolved world (constructorHref
 * is static text but callerRole gates the RoleSwitcher and needs server data)
 * — omitted, same "don't render what needs a fetch" rule as worldSwitcher
 * elsewhere in this batch.
 *
 * Content shape, read from page.tsx:96-110: StatusTabs (_components/
 * status-tabs.tsx:48-74 — a 3-segment control, Pendientes/Activos/Todos)
 * above a list of CharacterRow cards (_components/character-row.tsx:53-74 —
 * name + owner/class line, status pill, chevron).
 */
export default function WorldLandingLoading() {
  return (
    <AppShell title={<Skeleton className="h-5 w-32" />} subtitle="PANEL DE MAESTRO">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando panel de mundo"
        className="space-y-4"
      >
        <div className="flex w-full gap-1 rounded-md bg-paper-soft p-1">
          {STATUS_TABS.map((tab) => (
            <div key={tab} className="flex min-h-[44px] flex-1 items-center justify-center px-2">
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>

        <ul className="space-y-2">
          {CHARACTER_ROWS.map((row) => (
            <li key={row} className="rounded-md border border-line bg-surface px-4 py-3 shadow-stamp-md">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="mt-1.5 h-2.5 w-1/2" />
                </div>
                <Skeleton className="h-5 w-16 shrink-0" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
