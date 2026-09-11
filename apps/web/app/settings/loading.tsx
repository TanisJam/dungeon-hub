import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/**
 * Loading state for /settings (audit F1, work unit 3).
 *
 * title="Ajustes" and subtitle="TU CUENTA" are statically known
 * (page.tsx:57, both the success and FatalError branches use the same pair).
 *
 * Content shape, read from page.tsx:56-70 + _identity-header.tsx:22-64 in
 * ../dashboard: IdentityHeader (avatar circle + username/role-pill line +
 * optional Discord line, plus a trailing sign-out control) and a
 * "Preferencias" section with one toggle row (DevModeToggle).
 */
export default function SettingsLoading() {
  return (
    <AppShell title="Ajustes" subtitle="TU CUENTA">
      <div role="status" aria-busy="true" aria-label="Cargando Ajustes">
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-12" />
              </div>
              <Skeleton className="mt-1.5 h-2.5 w-20" />
            </div>
          </div>
          <Skeleton className="h-8 w-16 shrink-0" />
        </div>

        <div className="mt-8">
          <Skeleton className="mb-3 h-2.5 w-24" />
          <div className="rounded-md border border-line bg-surface-soft px-3 py-2">
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
