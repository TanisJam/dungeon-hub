'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type ActivateState = { error: string | null };

export async function activateCharacter(
  _prev: ActivateState,
  formData: FormData,
): Promise<ActivateState> {
  const characterId = String(formData.get('characterId') ?? '');
  if (!characterId) return { error: 'Missing characterId.' };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  try {
    await api.patch(`/characters/${characterId}`, { status: 'active' }, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect('/dashboard');
}
