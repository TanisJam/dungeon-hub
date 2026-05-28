'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ViewOnlySectionSheet } from './view-only-section-sheet';
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
  const [open, setOpen] = useState(false);

  const display = (
    <div className="space-y-1">
      <p className="text-sm text-ink">{raceName}</p>
      {subraceName && <p className="text-xs text-ink-mute">{subraceName}</p>}
    </div>
  );

  return (
    <>
      <button
        type="button"
        aria-label="Editar linaje"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={14} />
      </button>

      <ViewOnlySectionSheet
        title="Linaje"
        currentDisplay={display}
        characterStatus={characterStatus}
        isDm={isDm}
        wizardStepHref={`/characters/${characterId}/wizard/race`}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
