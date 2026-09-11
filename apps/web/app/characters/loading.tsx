import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui';

/**
 * Loading state for app/characters (audit F1, work unit 3) — covers
 * /characters/new and /characters/import. /characters/[id] keeps its own
 * loading.tsx (the sheet shape) and is unaffected.
 *
 * One boundary for both leaves, not two: read side by side,
 * app/characters/new/page.tsx:31-56 and app/characters/import/page.tsx:25-46
 * share the exact same skeleton — AppShell + one intro paragraph + a
 * mt-8 form of a couple of label/field pairs + a full-width submit button
 * (app/characters/new/_form.tsx:16-75, app/characters/import/_form.tsx
 * :129-208, both 'Mundo' select + one more field + Button). That shared
 * container shape is what this file renders; it is not lazy unification,
 * the two forms really do read the same at this level of abstraction.
 *
 * What genuinely differs between the two pages — title ("Constructor" vs
 * "Importar personaje"), subtitle, and the header decoration (new uses a
 * static rightAction exit link; import uses backHref="/personajes") — is
 * NOT something this shared file can know (it doesn't know which of the two
 * leaves triggered it), so title/subtitle render as <Skeleton> bars and both
 * header decorations are omitted rather than guessing one of them.
 */
export default function CharactersLoading() {
  return (
    <AppShell title={<Skeleton className="h-4 w-28" />} subtitle={<Skeleton className="h-2.5 w-32" />}>
      <div role="status" aria-busy="true" aria-label="Cargando" className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />

        <div className="mt-8 flex flex-col gap-5">
          <div>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-1.5 h-10 w-full" />
          </div>
          <div>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-1.5 h-10 w-full" />
          </div>
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </AppShell>
  );
}
