import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/**
 * Loading state for /characters/[id] (audit F1, work unit 2) — dynamic route.
 *
 * The character name is unknown while loading, so `title` is a <Skeleton> bar
 * instead of an invented placeholder name (AppShell.title now accepts ReactNode
 * for exactly this — components/layout/app-shell.tsx). `subtitle` is likewise a
 * Skeleton bar rather than omitted, so the header does not gain a row's worth of
 * height once the real classSummary text lands (app/characters/[id]/page.tsx:115).
 *
 * backHref="/personajes" and canBeDM={false} are statically known from the real
 * call (app/characters/[id]/page.tsx:163-170) and are mirrored here; rightAction
 * depends on server-resolved callerRole/status and is omitted.
 *
 * Content shape — hero + stat cells + tabs, read from:
 *   - components/sheet/sheet-hero.tsx:54-137 (hero: 80px ring portrait, name,
 *     subtitle, level/class pills row, XP bar)
 *   - components/sheet/vital-grid.tsx:63-97 (grid-cols-3 stat cells: Vida, Clase
 *     Armadura, Iniciativa — components/ui/stat-cell.tsx)
 *   - components/sheet/sheet-tabs.tsx:20-61 (6-pill ScrollNav: Resumen,
 *     Habilidades, Hechizos, Recursos, Inventario, Bitácora)
 */
export default function CharacterSheetLoading() {
  return (
    <AppShell title={<Skeleton className="h-4 w-32" />} subtitle={<Skeleton className="h-2.5 w-24" />} backHref="/personajes" canBeDM={false}>
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando ficha de personaje"
        className="space-y-4"
      >
        {/* SheetHero */}
        <div className="ficha-hero-bg relative overflow-hidden rounded-md px-4 py-5">
          <div className="relative z-10 flex items-center gap-4">
            <Skeleton className="h-20 w-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="mt-1.5 h-3 w-1/3" />
              <div className="mt-2 flex gap-1.5">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          </div>
          <Skeleton className="relative z-10 mt-4 h-1.5 w-full" />
        </div>

        {/* VitalGrid — Vida / Clase Armadura / Iniciativa */}
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 rounded-md border border-line px-3 py-4">
              <Skeleton className="h-2 w-12" />
              <Skeleton className="mt-1 h-5 w-10" />
            </div>
          ))}
        </div>

        {/* SheetTabs — Resumen/Habilidades/Hechizos/Recursos/Inventario/Bitácora */}
        <div className="flex gap-2 overflow-hidden py-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 shrink-0" />
          ))}
        </div>

        {/* Tab content (Resumen is the default tab) */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </AppShell>
  );
}
