'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type CreateState = { error: string | null };

export async function createCharacter(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  // TODO C6: The form still sends campaignId (campaign picker UX is replaced in C6 with world picker).
  // For now we resolve the campaign's worldId here as a bridge until C6 ships.
  const campaignId = String(formData.get('campaignId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();

  if (!campaignId) return { error: 'Pick a campaign.' };
  if (!name) return { error: 'Name is required.' };
  if (name.length > 60) return { error: 'Name must be 60 chars or fewer.' };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  // TODO C6: Resolve worldId from the selected campaignId (bridge until world picker lands).
  let worldId: string;
  try {
    const campaign = await api.get<{ worldId: string }>(`/campaigns/${campaignId}`, session.access_token);
    if (!campaign.worldId) return { error: 'Campaign has no associated world.' };
    worldId = campaign.worldId;
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  let created: { id: string };
  try {
    created = await api.post<{ id: string }>(
      '/characters',
      { worldId, name },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/characters/${created.id}/wizard/stats`);
}
