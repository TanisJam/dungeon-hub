'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

const IdSchema = z.string().uuid();

export type FichaActionResult =
  | { ok: true }
  | { ok: false; code: 'VALIDATION_FAILED' | 'UNAUTHORIZED' | 'API_ERROR'; message?: string };

export async function approveFichaFromInicio(id: string): Promise<FichaActionResult> {
  if (!IdSchema.safeParse(id).success) return { ok: false, code: 'VALIDATION_FAILED' };
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };
  try {
    await api.post(`/characters/${id}/approve`, {}, session.access_token);
  } catch (err) {
    const msg = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : undefined;
    return { ok: false, code: 'API_ERROR', message: msg };
  }
  revalidatePath('/inicio');
  return { ok: true };
}

export async function rejectFichaFromInicio(id: string): Promise<FichaActionResult> {
  if (!IdSchema.safeParse(id).success) return { ok: false, code: 'VALIDATION_FAILED' };
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };
  try {
    await api.post(`/characters/${id}/reject`, {}, session.access_token);
  } catch (err) {
    const msg = err instanceof ApiError ? (err.body as { message?: string } | null)?.message : undefined;
    return { ok: false, code: 'API_ERROR', message: msg };
  }
  revalidatePath('/inicio');
  return { ok: true };
}
