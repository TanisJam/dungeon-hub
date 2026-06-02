'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type CreateState = { error: string | null };

export async function createCampaign(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const name = String(formData.get('name') ?? '').trim();
  // worldId is forwarded from a hidden form field; NOT user-editable (REQ-CIW-02)
  const worldId = String(formData.get('worldId') ?? '').trim() || undefined;

  if (!name) return { error: 'Name is required.' };
  if (name.length > 120) return { error: 'Name must be 120 chars or fewer.' };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  const payload: { name: string; worldId?: string } = { name };
  if (worldId) payload.worldId = worldId;

  let created: { id: string };
  try {
    created = await api.post<{ id: string }>(
      '/campaigns',
      payload,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/campanas/${created.id}`);
}
