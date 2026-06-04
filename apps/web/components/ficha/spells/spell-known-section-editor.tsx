'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { SpellKnownEditor } from './spell-known-editor';
import { useSpellOptions } from './use-spell-options';
import type { SpellRef } from './save-spell-known-action';

interface AvailableSpell {
  slug: string;
  source: string;
  name: string;
  level: number;
  ritual?: boolean;
  concentration?: boolean;
  componentsM?: boolean;
  componentsMCost?: number | null;
}

interface SpellOptionsResponse {
  availableSpells: AvailableSpell[];
  [key: string]: unknown;
}

interface SpellKnownSectionEditorProps {
  characterId: string;
  classSlug: string;
  currentKnown: SpellRef[];
}

/**
 * SpellKnownSectionEditor — amber wand pencil + lazy fetch + V3Sheet.
 * DM-only affordance for setting known spells. Visually distinct: amber wand icon.
 * Fetch GET /classes/:slug/spells/options when sheet opens (same source as prep editor).
 * Spec: sdd/ficha-dm-affordances #995 — SpellKnownEditor Component.
 */
export function SpellKnownSectionEditor({
  characterId,
  classSlug,
  currentKnown,
}: SpellKnownSectionEditorProps) {
  const [open, setOpen] = useState(false);
  const fetchState = useSpellOptions<SpellOptionsResponse>(characterId, classSlug, open);

  function handleClose() {
    setOpen(false);
  }

  const currentKnownSlugs = new Set(currentKnown.map((s) => s.slug));

  return (
    <>
      {/* Amber wand affordance — visually distinct from prep pencil */}
      <button
        type="button"
        aria-label={`Asignar hechizos conocidos – ${classSlug}`}
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/40 text-amber-400 transition-colors hover:border-amber-400 hover:bg-amber-500/10"
        title="DM: asignar hechizos conocidos"
      >
        <Icon name="wand" size={14} />
      </button>

      <V3Sheet open={open} onClose={handleClose} title="Asignar hechizos conocidos (DM)">
        {fetchState.status === 'loading' && (
          <p className="p-4 text-sm text-ink-mute">Cargando hechizos…</p>
        )}

        {fetchState.status === 'error' && (
          <div
            role="alert"
            className="m-4 rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft"
          >
            {fetchState.message}
          </div>
        )}

        {fetchState.status === 'loaded' && (
          <SpellKnownEditor
            characterId={characterId}
            classSlug={classSlug}
            availableSpells={fetchState.data.availableSpells}
            currentKnownSlugs={currentKnownSlugs}
            onClose={handleClose}
          />
        )}
      </V3Sheet>
    </>
  );
}
