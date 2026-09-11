import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/**
 * Loading state for /bitacora (audit F1, work unit 2).
 *
 * Shaped after the loaded path in app/bitacora/page.tsx:102-120: AppShell with
 * subtitle="TODO" (worldSwitcher/roleDefault/callerRole all need server data and
 * are omitted per the brief), SubNav — 3 equal-width pills, Todo/Eventos/Notas
 * (components/world/_shell/sub-nav.tsx:24-50) — then GuildBitacoraFeed
 * (components/world/guild-bitacora/guild-bitacora-feed.tsx): a TagFilter chip row
 * (components/world/guild-bitacora/tag-filter.tsx:44-50) above a stack of FeedCard
 * articles — badge row + title + body snippet
 * (components/world/guild-bitacora/feed-card.tsx:117-157).
 */
export default function BitacoraLoading() {
  return (
    <AppShell title="Bitácora" subtitle="TODO">
      <div role="status" aria-busy="true" aria-label="Cargando Bitácora" className="flex flex-col gap-4">
        {/* SubNav — Todo/Eventos/Notas, 3 equal-width pills */}
        <div className="flex overflow-hidden rounded-lg border border-line">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex min-h-[44px] flex-1 items-center justify-center px-4 py-2">
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>

        {/* TagFilter — horizontal chip row */}
        <div className="flex gap-2 overflow-hidden">
          {['w-12', 'w-16', 'w-14', 'w-20', 'w-16'].map((w, i) => (
            <Skeleton key={i} className={`h-8 shrink-0 ${w}`} />
          ))}
        </div>

        {/* FeedCard stack */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[44px] flex-col gap-2 rounded-lg border border-line px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="ml-auto h-2.5 w-14" />
              </div>
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
