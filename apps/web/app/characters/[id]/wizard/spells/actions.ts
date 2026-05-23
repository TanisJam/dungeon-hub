'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { formatValidationIssues } from '@/lib/issue-messages';

export type SpellsState = { error: string | null };

type SpellRef = { slug: string; source: string };

type SpellPayload = {
  characterId: string;
  classSlug: string;
  cantrips: SpellRef[];
  known: SpellRef[];
  prepared: SpellRef[];
};

export async function saveSpells(payload: SpellPayload): Promise<SpellsState> {
  const { characterId, classSlug, cantrips, known, prepared } = payload;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  try {
    await api.put(
      `/characters/${characterId}/classes/${classSlug}/spells`,
      { cantrips, known, prepared },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as
        | {
            message?: string;
            error?: string;
            issues?: Array<{ code: string; note?: string } & Record<string, unknown>>;
          }
        | null;
      if (body?.issues?.length) {
        return { error: formatValidationIssues(body.issues) };
      }
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/characters/${characterId}/wizard/review`);
}

export async function skipSpells(characterId: string): Promise<SpellsState> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  redirect(`/characters/${characterId}/wizard/review`);
}
