'use client';

// NOTE: mirrors ViewOnlySectionSheet (apps/web/components/ficha/sections/view-only-section-sheet.tsx)
// Dev-only catalog island — renders the sheet directly with controlled open state.
// ViewOnlySectionSheet is PURELY PRESENTATIONAL — it receives open/onClose from the parent.
// The parent (BackgroundSection/ClassSection/RaceSection) owns the open state.
// This island demonstrates ViewOnlySectionSheet in isolation with a toggle button.

import { useState } from 'react';
import { ViewOnlySectionSheet } from '@/components/ficha/sections/view-only-section-sheet';
import type { CharacterStatus } from '@/lib/sheet-types';

interface Props {
  title: string;
  characterStatus: CharacterStatus;
  isDm: boolean;
  displayContent: React.ReactNode;
  wizardStepHref?: string;
}

export function ViewOnlySectionSheetIsland({
  title,
  characterStatus,
  isDm,
  displayContent,
  wizardStepHref = '#',
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-md border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-accent hover:text-accent transition-colors"
      >
        Abrir "{title}"
      </button>

      <ViewOnlySectionSheet
        title={title}
        currentDisplay={displayContent}
        characterStatus={characterStatus}
        isDm={isDm}
        wizardStepHref={wizardStepHref}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
