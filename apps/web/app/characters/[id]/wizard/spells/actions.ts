'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { formatValidationIssues } from '@/lib/issue-messages';

type SpellRef = { slug: string; source: string };

type SpellPayload = {
  characterId: string;
  classSlug: string;
  cantrips: SpellRef[];
  known: SpellRef[];
  prepared: SpellRef[];
};

export type SaveSpellsResult = { ok: true } | { ok: false; error: string };

export async function saveSpellsForClass(payload: SpellPayload): Promise<SaveSpellsResult> {
  const { characterId, classSlug, cantrips, known, prepared } = payload;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Not authenticated.' };

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
        return { ok: false, error: formatValidationIssues(body.issues) };
      }
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  return { ok: true };
}

export async function proceedToReview(characterId: string): Promise<never> {
  redirect(`/characters/${characterId}/wizard/review`);
}

export async function skipSpells(characterId: string): Promise<never> {
  redirect(`/characters/${characterId}/wizard/review`);
}
