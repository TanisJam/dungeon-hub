'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

type Method = 'standard-array' | 'point-buy' | 'roll';

type AbilityScores = {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
};

type SaveResult =
  | { ok: true }
  | { ok: false; error: 'locked' | 'validation' | 'auth' | 'unknown'; message?: string };

/**
 * saveAtributos — Server Action.
 * Calls PUT /characters/:id/stats with the new ability scores.
 * On success: revalidatePath so the ficha page re-fetches.
 * On CHARACTER_LOCKED 409: returns {ok:false, error:'locked'}.
 * IMPORTANT: Does NOT call redirect() — sheet close is handled by the caller.
 * Design: sdd/ficha-restyle — ATRIBUTOS-EDITOR-02.
 */
export async function saveAtributos(
  characterId: string,
  method: Method,
  scores: AbilityScores,
): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'auth', message: 'No autenticado.' };

  try {
    await api.put(
      `/characters/${characterId}/stats`,
      { method, scores },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string; message?: string } | null;
      if (err.status === 409 && body?.error === 'CHARACTER_LOCKED') {
        return { ok: false, error: 'locked' };
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
