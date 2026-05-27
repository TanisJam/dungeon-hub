'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ViewOnlySectionSheet } from './view-only-section-sheet';
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
  const [open, setOpen] = useState(false);

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
    <>
      <button
        type="button"
        aria-label="Editar trasfondo"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={14} />
      </button>

      <ViewOnlySectionSheet
        title="Trasfondo"
        currentDisplay={display}
        characterStatus={characterStatus}
        isDm={isDm}
        wizardStepHref={`/characters/${characterId}/wizard/background`}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
