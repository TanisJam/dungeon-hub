'use server';

import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { redirect } from 'next/navigation';
import type { EquipmentSelections } from '@dungeon-hub/domain/character/starting-equipment';
import type { EquipmentType } from '@dungeon-hub/domain/character/starting-equipment';

export type EquipmentSelectionsState = { error: string | null };

export type CategoryItemRow = {
  id: string;
  slug: string;
  source: string;
  name: string;
  type: string;
  weight: string | null;
  costCp: number | null;
};

/**
 * Fetch compendium items filtered by equipment category.
 * Called client-side from the CategoryPickerInline component.
 * Uses the Bearer JWT from the current session.
 */
export async function fetchCategoryItems(
  worldId: string,
  category: EquipmentType,
  q?: string,
): Promise<CategoryItemRow[]> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  try {
    const params = new URLSearchParams({ world: worldId, category, limit: '100' });
    if (q?.trim()) params.set('q', q.trim());
    const res = await api.get<{ data: CategoryItemRow[] }>(
      `/compendium/items?${params.toString()}`,
      session.access_token,
    );
    return res.data ?? [];
  } catch {
    return [];
  }
}

export async function saveEquipmentSelections(
  characterId: string,
  selections: EquipmentSelections,
): Promise<EquipmentSelectionsState> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  try {
    await api.put(
      `/characters/${characterId}/equipment-selections`,
      selections,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/characters/${characterId}/wizard/spells`);
}
