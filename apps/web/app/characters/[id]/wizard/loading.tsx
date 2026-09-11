import { Skeleton } from '@/components/ui';

/* Placeholder identities — see the note in app/bitacora/loading.tsx. */
const OPTION_ROWS = ['opt-1', 'opt-2', 'opt-3', 'opt-4'] as const;

/**
 * Loading state for app/characters/[id]/wizard (audit F1, work unit 3) —
 * covers all 8 step segments (index redirect + stats/race/class/background/
 * equipment/spells/review).
 *
 * This is DELIBERATELY NOT the character-sheet shape that
 * app/characters/[id]/loading.tsx renders (hero + stat cells + tabs) — the
 * brief calls this out as the part that matters most. Read
 * app/characters/[id]/wizard/layout.tsx:68-92: the layout renders AppShell,
 * the character name + status pill, and <Stepper>, then wraps {children} in
 * TermProvider. A loading.tsx placed HERE (inside app/characters/[id]/wizard/)
 * renders inside that layout, replacing only {children} — AppShell, the name
 * row and the Stepper all stay mounted and interactive while a step loads.
 * No AppShell here would double-render the shell.
 *
 * Content shape: every step page (race/page.tsx:210-237, stats/page.tsx:40-51,
 * review's own header, etc.) wraps its body in the same
 * <section><SectionHead size="md" num=".." title=".." meta="Paso N de 6"
 * description=".."/>...</section> pattern (components/ui/section-head.tsx:22-46,
 * 'md' branch). This mirrors that header shape, then a generic list of
 * option-card placeholders standing in for whatever picker the real step
 * renders (RacePicker, StatsForm, etc. — one shape can't represent all 8
 * pickers exactly, so this is deliberately generic rather than wrong for 7
 * of the 8 steps).
 */
export default function WizardStepLoading() {
  return (
    <section role="status" aria-busy="true" aria-label="Cargando paso del constructor">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-6 w-6 shrink-0 rounded-pill" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="ml-auto h-2.5 w-16 shrink-0" />
      </div>
      <Skeleton className="mt-2 h-3 w-3/4" />

      <div className="mt-6 flex flex-col gap-2">
        {OPTION_ROWS.map((row) => (
          <Skeleton key={row} className="h-16 w-full" />
        ))}
      </div>
    </section>
  );
}
