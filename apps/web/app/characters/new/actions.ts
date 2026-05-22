'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type CreateState = { error: string | null };

export async function createCharacter(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();

  if (!campaignId) return { error: 'Pick a campaign.' };
  if (!name) return { error: 'Name is required.' };
  if (name.length > 60) return { error: 'Name must be 60 chars or fewer.' };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  let created: { id: string };
  try {
    created = await api.post<{ id: string }>(
      '/characters',
      { campaignId, name },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/characters/${created.id}/build/stats`);
}
