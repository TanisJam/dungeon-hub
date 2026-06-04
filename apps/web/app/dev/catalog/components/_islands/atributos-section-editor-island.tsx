'use client';

// NOTE: mirrors AtributosSectionEditor (apps/web/components/ficha/atributos-section-editor.tsx)
// Dev-only catalog island — pencil button + V3Sheet + AtributosEditorIsland.
// Demonstrates the full section-editor chrome (pencil affordance + bottom sheet) without
// calling saveAtributos server action.
// PAIR ANALYSIS: AtributosSectionEditor is a THIN WRAPPER around AtributosEditor.
// It adds: (1) open/close state, (2) pencil Icon button affordance, (3) V3Sheet host.
// AtributosEditor owns ALL form logic. No duplication — clean separation.

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { AtributosEditorIsland } from './atributos-editor-island';

type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

interface Props {
  currentStats: AbilityScores;
  statusLocked: boolean;
  isDm: boolean;
}

export function AtributosSectionEditorIsland({ currentStats, statusLocked, isDm }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Editar atributos"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={16} />
      </button>

      <V3Sheet open={open} onClose={() => setOpen(false)} title="Editar atributos">
        <AtributosEditorIsland
          currentStats={currentStats}
          statusLocked={statusLocked}
          isDm={isDm}
        />
      </V3Sheet>
    </>
  );
}
