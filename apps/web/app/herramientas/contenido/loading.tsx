import { AppShell } from '@/components/layout/app-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { Skeleton } from '@/components/ui';
import { HERRAMIENTAS_SUBNAV_ITEMS } from '../_components/subnav-items';

/**
 * Loading state for /herramientas/contenido (audit F1, work unit 3) —
 * overrides the shared app/herramientas/loading.tsx. Contenido is a JSON
 * upload form (info box + textarea + button + a collapsible example), not a
 * search-and-list screen like Facciones/NPCs/Quests — same reasoning as
 * /herramientas/tienda's own loading.tsx.
 *
 * subtitle="CONTENIDO" and the active SubNav pill are statically known here.
 *
 * Content shape, read from ./_form.tsx:22-83: a source-code info box
 * (line 24-32), a form with one labeled textarea (rows=12, line 39-55) and a
 * full-width submit button, then a collapsible "Ejemplo de JSON esperado"
 * (<details>, line 73-80). The "no active world" and "API not deployed yet"
 * branches (page.tsx:51-67, 99-118) are not represented — they're
 * error/empty states, not what a successful load looks like.
 */
export default function ContenidoLoading() {
  return (
    <AppShell title="Herramientas" subtitle="CONTENIDO">
      <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="/herramientas/contenido" />

      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Contenido"
        className="flex flex-col gap-5"
      >
        <div className="rounded-md border border-line bg-paper-soft px-3 py-2.5">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-1.5 h-2.5 w-1/2" />
        </div>

        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-32 w-full" />
        </div>

        <Skeleton className="h-11 w-full" />

        <div className="flex min-h-[44px] items-center rounded-md border border-line bg-paper-soft px-3">
          <Skeleton className="h-3.5 w-56" />
        </div>
      </div>
    </AppShell>
  );
}
