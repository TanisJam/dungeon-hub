'use client';

import { SectionAffordance } from './section-affordance';
import type { CharacterStatus } from '@/lib/sheet-types';

interface RaceSectionProps {
  characterId: string;
  characterStatus: CharacterStatus;
  isDm: boolean;
  raceName: string;
  subraceName?: string;
}

/**
 * RaceSection — pencil affordance for the Linaje section on ResumenTab.
 * Opens a ViewOnlySectionSheet with read-only race/subrace display.
 * Design: sdd/ficha-section-editors — VIEW-SHEET-03.
 */
export function RaceSection({
  characterId,
  characterStatus,
  isDm,
  raceName,
  subraceName,
}: RaceSectionProps) {
  const display = (
    <div className="space-y-1">
      <p className="text-sm text-ink">{raceName}</p>
      {subraceName && <p className="text-xs text-ink-mute">{subraceName}</p>}
    </div>
  );

  return (
    <SectionAffordance
      ariaLabel="Editar linaje"
      title="Linaje"
      characterStatus={characterStatus}
      isDm={isDm}
      wizardStepHref={`/characters/${characterId}/wizard/race`}
    >
      {display}
    </SectionAffordance>
  );
}
