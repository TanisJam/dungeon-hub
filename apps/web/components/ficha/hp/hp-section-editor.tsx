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
      <button
        type="button"
        aria-label="Editar HP"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={16} />
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
