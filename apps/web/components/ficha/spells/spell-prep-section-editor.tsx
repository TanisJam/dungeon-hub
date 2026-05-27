'use client';

import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { SpellPrepEditor } from './spell-prep-editor';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import type { SpellRef } from './save-spell-prep-action';

interface AvailableSpell {
  slug: string;
  source: string;
  name: string;
  level: number;
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  componentsMCost: number | null;
}

interface SpellOptionsResponse {
  limits: {
    spellsPrepared: number | null;
    [key: string]: unknown;
  };
  availableSpells: AvailableSpell[];
  subclassGrantedSlugs: string[];
}

interface SpellPrepSectionEditorProps {
  characterId: string;
  classSlug: string;
  initialPrepared: SpellRef[];
  prepLimit: number;
  existingCantrips: SpellRef[];
  existingKnown: SpellRef[];
  onClose?: () => void;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: SpellOptionsResponse }
  | { status: 'error'; message: string };

/**
 * SpellPrepSectionEditor — pencil + V3Sheet wrapper for spell preparation.
 * Fetches /options lazily when the sheet opens.
 * Design: sdd/ficha-section-editors — SPELL-PREP-01, SPELL-PREP-06.
 */
export function SpellPrepSectionEditor({
  characterId,
  classSlug,
  initialPrepared,
  prepLimit,
  existingCantrips,
  existingKnown,
  onClose,
}: SpellPrepSectionEditorProps) {
  const [open, setOpen] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'idle' });

  // Fetch options when sheet opens
  useEffect(() => {
    if (!open) return;
    setFetchState({ status: 'loading' });

    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;

        const data = await api.get<SpellOptionsResponse>(
          `/characters/${characterId}/classes/${classSlug}/spells/options`,
          accessToken,
        );
        setFetchState({ status: 'loaded', data });
      } catch (err) {
        setFetchState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Error al cargar hechizos.',
        });
      }
    })();
  }, [open, characterId, classSlug]);

  function handleClose() {
    setOpen(false);
    onClose?.();
  }

  return (
    <>
      {/* Pencil affordance */}
      <button
        type="button"
        aria-label={`Preparar hechizos – ${classSlug}`}
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent"
      >
        <Icon name="edit" size={14} />
      </button>

      {/* V3Sheet */}
      <V3Sheet
        open={open}
        onClose={handleClose}
        title={`Preparar hechizos`}
      >
        {fetchState.status === 'loading' && (
          <p className="text-sm text-ink-mute">Cargando hechizos…</p>
        )}

        {fetchState.status === 'error' && (
          <div role="alert" className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft">
            {fetchState.message}
          </div>
        )}

        {fetchState.status === 'loaded' && (
          <SpellPrepEditor
            characterId={characterId}
            classSlug={classSlug}
            classSource="PHB"
            availableSpells={fetchState.data.availableSpells}
            subclassGrantedSlugs={fetchState.data.subclassGrantedSlugs}
            initialPrepared={initialPrepared}
            prepLimit={prepLimit}
            existingCantrips={existingCantrips}
            existingKnown={existingKnown}
            onClose={handleClose}
          />
        )}
      </V3Sheet>
    </>
  );
}
