'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type SaveHpResult =
  | { ok: true }
  | { ok: false; error: 'auth' | 'forbidden' | 'validation' | 'unknown'; message?: string };

/**
 * saveHp — Server Action.
 * Calls PUT /characters/:id/hp with updated HP fields.
 * Owner can set current + temp. DM can set all three.
 * On success: revalidatePath and close sheet.
 * Spec: sdd/ficha-dm-affordances #995 — HPEditor Component.
 */
export async function saveHp(input: {
  characterId: string;
  current?: number;
  max?: number;
  temp?: number;
}): Promise<SaveHpResult> {
  const { characterId, ...hpFields } = input;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'auth', message: 'No autenticado.' };

  try {
    await api.put(`/characters/${characterId}/hp`, hpFields, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string; message?: string; issues?: Array<{ code: string }> } | null;
      if (err.status === 403) {
        return { ok: false, error: 'forbidden', message: body?.message ?? 'Sin permiso.' };
      }
      if (err.status === 400) {
        const issueCode = body?.issues?.[0]?.code;
        return {
          ok: false,
          error: 'validation',
          message: issueCode ?? body?.message ?? 'Datos inválidos.',
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
