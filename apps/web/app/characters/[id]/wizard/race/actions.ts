'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { formatValidationIssues } from '@/lib/issue-messages';

export type RaceState = { error: string | null };

type AsiPayload = {
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  bonus: number;
  source: 'race' | 'subrace';
};

type FeatChoicePayload = {
  slug: string;
  source: string;
  asiChoice?: Array<{ ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; bonus: number }>;
} | null;

export async function saveRace(
  characterId: string,
  race: { slug: string; source: string },
  subrace: { slug: string; source: string } | null,
  appliedAsis: AsiPayload[],
  languageChoices: string[] = [],
  skillChoices: string[] = [],
  featChoice: FeatChoicePayload = null,
): Promise<RaceState> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  try {
    await api.put(
      `/characters/${characterId}/race`,
      {
        race,
        subrace,
        appliedAsis,
        languageChoices,
        ...(skillChoices.length > 0 ? { skillChoices } : {}),
        ...(featChoice ? { featChoice } : {}),
      },
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

  redirect(`/characters/${characterId}/wizard/class`);
}
