'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { formatValidationIssues } from '@/lib/issue-messages';

export type ClassState = { error: string | null };

export async function saveClass(
  characterId: string,
  klass: { slug: string; source: string },
  level: number,
  skillChoices: string[],
  subclass: { slug: string; source: string } | null,
): Promise<ClassState> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  try {
    await api.put(
      `/characters/${characterId}/class`,
      { class: klass, level, skillChoices, subclass },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as
        | { message?: string; error?: string; issues?: Array<{ code: string; note?: string } & Record<string, unknown>> }
        | null;
      if (body?.issues?.length) {
        return { error: formatValidationIssues(body.issues) };
      }
      return { error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }

  redirect(`/characters/${characterId}/wizard/background`);
}
