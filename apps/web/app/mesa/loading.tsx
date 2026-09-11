import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx.
   7 links total: Aprobaciones + Encuentros + the 5 HERRAMIENTAS_SUBNAV_ITEMS
   (page.tsx:67-75). */
const HUB_LINKS = [
  'link-1',
  'link-2',
  'link-3',
  'link-4',
  'link-5',
  'link-6',
  'link-7',
] as const;

/**
 * Loading state for /mesa (audit F1, work unit 3).
 *
 * title="Mesa" and subtitle="HERRAMIENTAS DEL DM" are statically known
 * (page.tsx:78-83, no server-dependent variant).
 *
 * Content shape, read from page.tsx:84-97: a flat nav list of 7 links (icon
 * cell + label), min-h-[44px] rows.
 */
export default function MesaLoading() {
  return (
    <AppShell title="Mesa" subtitle="HERRAMIENTAS DEL DM">
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando Mesa"
        className="flex flex-col gap-2"
      >
        {HUB_LINKS.map((link) => (
          <div
            key={link}
            className="flex min-h-[44px] items-center gap-3 rounded-md border border-line bg-surface-soft px-3 py-2.5"
          >
            <Skeleton className="h-9 w-9 shrink-0" />
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
