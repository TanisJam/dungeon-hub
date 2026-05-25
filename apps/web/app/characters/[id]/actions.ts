'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeleteState = { ok: false; error: string } | { ok: true };

// ── SP-05: Spell slot consumption ────────────────────────────────────────────

export type SlotActionState = { ok: false; error: string } | { ok: true };

/**
 * Consume one spell slot of the given level and type.
 * PHB p.201 — "you expend a spell slot to cast a spell of that level or higher."
 */
export async function useSpellSlot(
  characterId: string,
  level: number,
  slotType: 'regular' | 'pact',
): Promise<SlotActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/spell-slots/use`, { level, slotType }, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Perform a long rest for the character.
 * PHB p.186 — restores HP to max, half of total hit dice, and all expended spell slots
 * (except warlock pact slots, which recover on short rest).
 */
export async function longRest(characterId: string): Promise<SlotActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/rest/long`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Perform a short rest for the character.
 * PHB p.186 + p.107 — restores warlock pact slots; does NOT restore regular spell slots.
 */
export async function shortRest(characterId: string): Promise<SlotActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/rest/short`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

// ── Existing actions ──────────────────────────────────────────────────────────

export async function deleteCharacter(characterId: string): Promise<DeleteState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.delete(`/characters/${characterId}`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath('/characters');
  redirect('/');
}
