'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

export type StatsState = { error: string | null };

type Method = 'standard-array' | 'point-buy' | 'roll';

export async function saveStats(
  characterId: string,
  method: Method,
  scores: { str: number; dex: number; con: number; int: number; wis: number; cha: number },
): Promise<StatsState> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Not authenticated.' };

  try {
    await api.put(
      `/characters/${characterId}/stats`,
      { method, scores },
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

  redirect(`/characters/${characterId}/wizard/race`);
}
