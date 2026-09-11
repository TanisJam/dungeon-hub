import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const OPTION_ROWS = ['opt-1', 'opt-2', 'opt-3'] as const;

/**
 * Loading state for /characters/[id]/level-up (audit F1, work unit 3) — its
 * own page, own boundary. DELIBERATELY NOT the character-sheet shape from
 * app/characters/[id]/loading.tsx, same reasoning the brief calls out for
 * the wizard: level-up "is its own page with backHref and showTabBar gone".
 *
 * page.tsx:291 renders `<AppShell title="Subir nivel" backHref={...}>` —
 * title is statically known and mirrored; backHref needs the character id,
 * which loading.tsx never receives (Next.js passes no params to loading.js
 * special files — confirmed against framework docs), so it is omitted
 * rather than guessed, same decision as the campaign-session loading state.
 *
 * Content shape, read from app/characters/[id]/level-up/_flow.tsx:298-339:
 * LevelUpFlow renders its OWN header inside the AppShell content area (back
 * button + "Subir de nivel" eyebrow + character name + "current/total" step
 * count, line 300-319), a 1px progress bar (line 322-327), then step content
 * (line 330+). The name is unknown while loading, so it is a Skeleton bar
 * too; the step content itself varies per step (mode/class/hp/subclass/
 * asi-feat/spells/review) so it is represented generically, same approach as
 * the wizard's shared step loading.tsx.
 */
export default function LevelUpLoading() {
  return (
    <AppShell title="Subir nivel">
      <div className="md:mx-auto md:max-w-lg">
        <div
          role="status"
          aria-busy="true"
          aria-label="Cargando subida de nivel"
          className="flex min-h-screen flex-col bg-paper md:min-h-0 md:rounded-lg md:shadow-stamp-lg"
        >
          {/* LevelUpFlow's own header */}
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="flex-1">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="mt-1.5 h-3.5 w-32" />
            </div>
            <Skeleton className="h-2.5 w-8 shrink-0" />
          </div>

          {/* Progress bar */}
          <Skeleton className="h-1 w-full rounded-none" />

          {/* Step content — generic, the real step varies (mode/class/hp/…) */}
          <div className="flex-1 px-4 py-6">
            <div className="flex flex-col gap-2">
              {OPTION_ROWS.map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
