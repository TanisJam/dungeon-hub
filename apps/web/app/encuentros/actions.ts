'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

const IdSchema = z.string().uuid();

export type EncounterActionResult =
  | { ok: true }
  | {
      ok: false;
      code: 'VALIDATION_FAILED' | 'UNAUTHORIZED' | 'VERSION_CONFLICT' | 'API_ERROR';
      message?: string;
    };

export async function advanceEncounterTurn(
  id: string,
  version: number,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(id).success) {
    return { ok: false, code: 'VALIDATION_FAILED' };
  }
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    await api.post(`/encounters/${id}/advance-turn`, { version }, session.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : undefined;
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${id}`);
  return { ok: true };
}
