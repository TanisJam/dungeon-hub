'use server';

import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type PublishState = { error: string | null; success: boolean };

export async function publishCharacter(
  _prev: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const characterId = String(formData.get('characterId') ?? '');
  if (!characterId) return { error: 'Missing characterId.', success: false };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.', success: false };

  try {
    await api.patch(`/characters/${characterId}`, { status: 'pending_approval' }, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}`, success: false };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error', success: false };
  }

  return { error: null, success: true };
}

export async function updateCharacterName(
  characterId: string,
  name: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated' };
  try {
    await api.patch(`/characters/${characterId}`, { name }, session.access_token);
    return { error: null };
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string } | null;
      return { error: body?.message ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
