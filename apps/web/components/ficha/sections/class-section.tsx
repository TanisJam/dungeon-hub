'use client';

import { SectionAffordance } from './section-affordance';
import type { CharacterStatus } from '@/lib/sheet-types';

interface ClassEntry {
  slug: string;
  level: number;
  subclass?: { slug: string; source?: string } | null;
}

interface ClassSectionProps {
  characterId: string;
  characterStatus: CharacterStatus;
  isDm: boolean;
  classes: ClassEntry[];
}

/**
 * ClassSection — pencil affordance for the Clase section on ResumenTab.
 * Opens a ViewOnlySectionSheet with read-only class list display.
 * Design: sdd/ficha-section-editors — VIEW-SHEET-03.
 */
export function ClassSection({
  characterId,
  characterStatus,
  isDm,
  classes,
}: ClassSectionProps) {
  const display = (
    <div className="space-y-1">
      {classes.map((c) => (
        <p key={c.slug} className="text-sm text-ink capitalize">
          {c.slug} {c.level}{c.subclass ? ` (${c.subclass.slug})` : ''}
        </p>
      ))}
    </div>
  );

  return (
    <SectionAffordance
      ariaLabel="Editar clase"
      title="Clase"
      characterStatus={characterStatus}
      isDm={isDm}
      wizardStepHref={`/characters/${characterId}/wizard/class`}
    >
      {display}
    </SectionAffordance>
  );
}
