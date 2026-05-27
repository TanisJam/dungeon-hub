'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ViewOnlySectionSheet } from './view-only-section-sheet';
import type { CharacterStatus } from '@/lib/sheet-types';

interface ClassEntry {
  slug: string;
  level: number;
  subclass?: { slug: string };
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
  const [open, setOpen] = useState(false);

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
    <>
      <button
        type="button"
        aria-label="Editar clase"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={14} />
      </button>

      <ViewOnlySectionSheet
        title="Clase"
        currentDisplay={display}
        characterStatus={characterStatus}
        isDm={isDm}
        wizardStepHref={`/characters/${characterId}/wizard/class`}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
