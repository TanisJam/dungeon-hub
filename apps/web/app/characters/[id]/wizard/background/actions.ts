'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

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
        | { message?: string; error?: string; issues?: Array<{ code: string }> }
        | null;
      if (body?.issues?.length) {
        return { error: `Validation failed: ${body.issues.map((i) => i.code).join(', ')}` };
      }
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/characters/${characterId}/wizard/review`);
}
