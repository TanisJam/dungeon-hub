'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export interface SpellRef {
  slug: string;
  source: string;
}

export type SaveSpellPrepResult =
  | { ok: true }
  | { ok: false; error: 'auth' | 'validation' | 'over_limit' | 'unknown'; message?: string };

/**
 * saveSpellPrepForClass — Server Action.
 * Calls PUT /characters/:id/classes/:slug/spells with the updated prepared list.
 * Subclass-granted spells are EXCLUDED from `prepared` (server handles them).
 * On success: revalidatePath and close sheet.
 * Design: sdd/ficha-section-editors — SPELL-PREP-07.
 */
export async function saveSpellPrepForClass(input: {
  characterId: string;
  classSlug: string;
  cantrips: SpellRef[];
  known: SpellRef[];
  prepared: SpellRef[];
}): Promise<SaveSpellPrepResult> {
  const { characterId, classSlug, cantrips, known, prepared } = input;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'auth', message: 'No autenticado.' };

  try {
    await api.put(
      `/characters/${characterId}/classes/${classSlug}/spells`,
      { cantrips, known, prepared },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string; message?: string } | null;
      if (err.status === 409) {
        return { ok: false, error: 'over_limit' };
      }
      if (err.status === 400) {
        return {
          ok: false,
          error: 'validation',
          message: body?.message ?? 'Datos inválidos.',
        };
      }
      return {
        ok: false,
        error: 'unknown',
        message: body?.message ?? `Error ${err.status}`,
      };
    }
    return {
      ok: false,
      error: 'unknown',
      message: err instanceof Error ? err.message : 'Error desconocido.',
    };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}
