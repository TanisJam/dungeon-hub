'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { AtributosEditor } from './atributos-editor';
import type { AbilityScores } from './atributos-editor';

type Method = 'standard-array' | 'point-buy' | 'roll';

interface AtributosSectionEditorProps {
  characterId: string;
  currentStats: AbilityScores;
  currentMethod: Method;
  /** Derived from char.status ∈ {active, retired, dead} — computed server-side. */
  statusLocked: boolean;
  /** Computed server-side: callerRole === 'gm'. DM bypasses lock. */
  isDm: boolean;
}

/**
 * AtributosSectionEditor — pencil affordance button + V3Sheet host + AtributosEditor form.
 * Client component. Colocates open/close state with the sheet trigger.
 * Design: sdd/ficha-restyle — FICHA-EDIT-AFFORDANCE-01.
 */
export function AtributosSectionEditor({
  characterId,
  currentStats,
  currentMethod,
  statusLocked,
  isDm,
}: AtributosSectionEditorProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Pencil affordance — tap to open editor */}
      <button
        type="button"
        aria-label="Editar atributos"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={16} />
      </button>

      {/* V3Sheet — bottom modal, controlled */}
      <V3Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Editar atributos"
      >
        <AtributosEditor
          characterId={characterId}
          currentStats={currentStats}
          currentMethod={currentMethod}
          statusLocked={statusLocked}
          isDm={isDm}
          onClose={() => setOpen(false)}
        />
      </V3Sheet>
    </>
  );
}
