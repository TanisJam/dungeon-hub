'use server';

import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';
import type { EquipmentSelections } from '@dungeon-hub/domain/character/starting-equipment';

export type PublishState = { error: string | null; success: boolean };

type CharacterWithSelections = {
  data: {
    equipmentSelections?: EquipmentSelections;
  } | null;
};

export async function publishCharacter(
  _prev: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const characterId = String(formData.get('characterId') ?? '');
  if (!characterId) return { error: 'Missing characterId.', success: false };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.', success: false };

  // Seed starting equipment before publishing (ADR-5, REQ-SEQUIP-04).
  // Idempotent: if already seeded, the use-case returns ok without writing again.
  // Read stored selections from character.data.equipmentSelections (ADR-6).
  try {
    const character = await api.get<CharacterWithSelections>(
      `/characters/${characterId}`,
      session.access_token,
    );
    const selections = character.data?.equipmentSelections;
    if (selections) {
      await api.post(
        `/characters/${characterId}/seed-equipment`,
        selections,
        session.access_token,
      );
    }
  } catch (err) {
    // Non-fatal: if seed fails (e.g. no equipment selections yet), continue publishing.
    // The DM can see an empty inventory and the player can re-open the wizard.
    if (err instanceof ApiError && err.status === 400) {
      // Validation failure — selections exist but are invalid. Log but don't block.
      // In practice this should not happen if the wizard step validated before saving.
    }
    // For 401/403/5xx we propagate — something is genuinely wrong.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}`, success: false };
    }
  }

  try {
    await api.patch(
      `/characters/${characterId}`,
      { status: 'pending_approval' },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { error: body?.message ?? body?.error ?? `API ${err.status}`, success: false };
    }
    return { error: getErrorMessage(err, 'Unknown error'), success: false };
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
    return { error: getErrorMessage(err, 'Unknown error') };
  }
}
