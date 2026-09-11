'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { HPEditor } from './hp-editor';
import type { HpValues } from './hp-editor';

interface HPSectionEditorProps {
  characterId: string;
  currentHp: HpValues;
  isDmHere: boolean;
}

/**
 * HPSectionEditor — pencil affordance + V3Sheet host for the HP editor.
 * Client component. Colocates open/close state with the sheet trigger.
 * Spec: sdd/ficha-dm-affordances #995 — HPEditor Component.
 */
export function HPSectionEditor({ characterId, currentHp, isDmHere }: HPSectionEditorProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Pencil affordance */}
      {/*
        The tap area stays 44px, but its visible chrome is a 24px mark pinned to
        the button's top-right corner. A 44px bordered box in the HP cell reaches
        down over the value: the cell is 109px wide at 375px, so the box covered
        the label before and would cover "12 / 12" after. See audit F7.
      */}
      <button
        type="button"
        aria-label="Editar HP"
        onClick={() => setOpen(true)}
        className="group flex min-h-[44px] min-w-[44px] items-start justify-end text-ink-mute transition-colors hover:text-accent"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line transition-colors group-hover:border-accent">
          <Icon name="edit" size={14} />
        </span>
      </button>

      {/* V3Sheet — bottom modal, controlled */}
      <V3Sheet open={open} onClose={() => setOpen(false)} title="Editar HP">
        <HPEditor
          characterId={characterId}
          currentHp={currentHp}
          isDmHere={isDmHere}
          onClose={() => setOpen(false)}
        />
      </V3Sheet>
    </>
  );
}
