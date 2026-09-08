'use client';

/**
 * useSpellOptions — shared lazy-fetch hook for spell section editors.
 *
 * Encapsulates the identical FetchState + useEffect pattern duplicated verbatim
 * between SpellKnownSectionEditor and SpellPrepSectionEditor.
 *
 * Fetches GET /characters/:id/classes/:slug/spells/options when `open` becomes
 * true. No fetch while `open` is false (stays idle). Re-runs when characterId,
 * classSlug, or open changes (same deps as the original useEffect in both editors).
 *
 * Dedup: web-component-catalog/homogenization-tier1 — Dedup 1.
 */

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';

// Generic enough to cover both SpellOptionsResponse shapes.
// SpellKnownSectionEditor uses { availableSpells: AvailableSpell[] }
// SpellPrepSectionEditor uses { limits, availableSpells, subclassGrantedSlugs }
// The caller casts to its own typed response — we expose unknown data here.
export type FetchState<T = unknown> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; message: string };

/**
 * Lazily fetches spell options when the sheet `open` becomes true.
 * Returns the current FetchState.
 */
export function useSpellOptions<T = unknown>(
  characterId: string,
  classSlug: string,
  open: boolean,
): FetchState<T> {
  const [fetchState, setFetchState] = useState<FetchState<T>>({ status: 'idle' });

  useEffect(() => {
    if (!open) return;
    setFetchState({ status: 'loading' });

    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;

        const data = await api.get<T>(
          `/characters/${characterId}/classes/${classSlug}/spells/options`,
          accessToken,
        );
        setFetchState({ status: 'loaded', data });
      } catch (err) {
        setFetchState({
          status: 'error',
          message: getErrorMessage(err, 'Error al cargar hechizos.'),
        });
      }
    })();
  }, [open, characterId, classSlug]);

  return fetchState;
}
