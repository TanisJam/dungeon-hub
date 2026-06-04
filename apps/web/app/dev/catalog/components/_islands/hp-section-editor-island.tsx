'use client';

// NOTE: mirrors HPSectionEditor (apps/web/components/ficha/hp/hp-section-editor.tsx)
// Dev-only catalog island — pencil button + V3Sheet + HPEditorIsland.
// PAIR ANALYSIS: HPSectionEditor is a THIN WRAPPER around HPEditor.
// It adds: (1) open/close state, (2) pencil Icon button affordance (min-h-[44px] — touch-safe),
// (3) V3Sheet host titled "Editar HP". HPEditor owns ALL form logic.
// Structural difference from AtributosSectionEditor: HPSectionEditor's pencil button
// is 44×44px (touch-safe) while AtributosSectionEditor's is only 32×32px (below 44px touch target).
// → Minor inconsistency between the two pairs worth noting for homogenization.

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { HPEditorIsland, type HpValues } from './hp-editor-island';

interface Props {
  currentHp: HpValues;
  isDmHere: boolean;
}

export function HPSectionEditorIsland({ currentHp, isDmHere }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Editar HP"
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={16} />
      </button>

      <V3Sheet open={open} onClose={() => setOpen(false)} title="Editar HP">
        <HPEditorIsland currentHp={currentHp} isDmHere={isDmHere} />
      </V3Sheet>
    </>
  );
}
