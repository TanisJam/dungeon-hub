'use client';

import { SectionAffordance } from './section-affordance';
import type { CharacterStatus } from '@/lib/sheet-types';

interface BackgroundSectionProps {
  characterId: string;
  characterStatus: CharacterStatus;
  isDm: boolean;
  backgroundName: string;
  featureName?: string;
  skillProficiencies?: string[];
}

/**
 * BackgroundSection — pencil affordance for the Trasfondo section on ResumenTab.
 * Opens a ViewOnlySectionSheet with read-only background display.
 * Design: sdd/ficha-section-editors — VIEW-SHEET-03.
 */
export function BackgroundSection({
  characterId,
  characterStatus,
  isDm,
  backgroundName,
  featureName,
  skillProficiencies,
}: BackgroundSectionProps) {
  const display = (
    <div className="space-y-1">
      <p className="text-sm text-ink capitalize">{backgroundName}</p>
      {featureName && <p className="text-xs text-ink-mute">{featureName}</p>}
      {skillProficiencies && skillProficiencies.length > 0 && (
        <p className="text-xs text-ink-mute capitalize">
          {skillProficiencies.join(', ')}
        </p>
      )}
    </div>
  );

  return (
    <SectionAffordance
      ariaLabel="Editar trasfondo"
      title="Trasfondo"
      characterStatus={characterStatus}
      isDm={isDm}
      wizardStepHref={`/characters/${characterId}/wizard/background`}
    >
      {display}
    </SectionAffordance>
  );
}
