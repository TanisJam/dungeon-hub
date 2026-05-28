'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type SpellRef = { slug: string; source?: string };

export type SaveSpellKnownResult =
  | { ok: true }
  | {
      ok: false;
      error: 'auth' | 'forbidden' | 'validation' | 'unknown';
      message?: string;
      offendingSlugs?: string[];
    };

/**
 * saveSpellKnown — Server Action (DM-only).
 * Calls PUT /characters/:id/classes/:classSlug/known with the new known list.
 * Bypasses RAW known cap and KNOWN_NOT_ALLOWED. Only DM role can call this.
 * On success: revalidatePath and close sheet.
 * Spec: sdd/ficha-dm-affordances #995 — SpellKnownEditor Component.
 */
export async function saveSpellKnown(input: {
  characterId: string;
  classSlug: string;
  known: SpellRef[];
}): Promise<SaveSpellKnownResult> {
  const { characterId, classSlug, known } = input;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'auth', message: 'No autenticado.' };

  try {
    await api.put(
      `/characters/${characterId}/classes/${classSlug}/known`,
      { known },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as {
        error?: string;
        message?: string;
        issues?: Array<{ code: string; slug?: string }>;
      } | null;

      if (err.status === 403) {
        return { ok: false, error: 'forbidden', message: body?.message ?? 'Sin permiso.' };
      }

      if (err.status === 400) {
        // Extract offending slugs for SPELL_NOT_IN_CLASS_LIST errors
        const offendingSlugs = body?.issues
          ?.filter((i) => i.code === 'SPELL_NOT_IN_CLASS_LIST' && i.slug)
          .map((i) => i.slug!);

        return {
          ok: false,
          error: 'validation',
          message: body?.issues?.[0]?.code ?? body?.message ?? 'Datos inválidos.',
          ...(offendingSlugs?.length ? { offendingSlugs } : {}),
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
