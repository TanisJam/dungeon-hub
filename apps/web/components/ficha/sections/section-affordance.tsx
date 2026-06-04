'use client';

import React, { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ViewOnlySectionSheet } from './view-only-section-sheet';
import type { CharacterStatus } from '@/lib/sheet-types';

interface SectionAffordanceProps {
  /** Aria-label for the pencil edit button (e.g. "Editar trasfondo"). */
  ariaLabel: string;
  /** Title shown in the ViewOnlySectionSheet header. */
  title: string;
  characterStatus: CharacterStatus;
  isDm: boolean;
  /** Wizard step URL for the edit link inside the sheet. */
  wizardStepHref: string;
  /** Read-only display content rendered inside the sheet body. */
  children: React.ReactNode;
}

/**
 * SectionAffordance — pencil button + ViewOnlySectionSheet.
 *
 * Extracts the triplicate pattern from BackgroundSection, ClassSection, and
 * RaceSection: all three have the same pencil affordance (h-8 w-8, border-line,
 * hover:accent) and the same ViewOnlySectionSheet. They differ only in title,
 * display content (children), and wizardStepHref.
 *
 * Dedup: web-component-catalog/homogenization-tier1 — Dedup 2.
 */
export function SectionAffordance({
  ariaLabel,
  title,
  characterStatus,
  isDm,
  wizardStepHref,
  children,
}: SectionAffordanceProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={14} />
      </button>

      <ViewOnlySectionSheet
        title={title}
        currentDisplay={children}
        characterStatus={characterStatus}
        isDm={isDm}
        wizardStepHref={wizardStepHref}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
