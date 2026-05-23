'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { formatValidationIssues } from '@/lib/issue-messages';

export type BackgroundState = { error: string | null };

export async function saveBackground(
  characterId: string,
  bg: { slug: string; source: string },
  skillChoices: string[],
  languageChoices: string[],
  toolChoices: Record<string, string[]>,
): Promise<BackgroundState> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  try {
    await api.put(
      `/characters/${characterId}/background`,
      { background: bg, skillChoices, languageChoices, toolChoices },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as
        | { message?: string; error?: string; issues?: Array<{ code: string } & Record<string, unknown>> }
        | null;
      if (body?.issues?.length) {
        return { error: formatValidationIssues(body.issues) };
      }
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/characters/${characterId}/wizard/spells`);
}
