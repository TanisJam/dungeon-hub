'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LevelUpState =
  | { ok: false; error: string; issues?: Array<{ code: string; [key: string]: unknown }> }
  | { ok: true; summary: LevelUpSummary };

export interface LevelUpSummary {
  classSlug: string;
  fromClassLevel: number;
  toClassLevel: number;
  totalLevelAfter: number;
  hpDelta: number;
  rollUsed: number | null;
  asiFeatApplied?: 'asi' | 'feat';
}

export type LevelUpBody =
  | {
      kind: 'same-class';
      class: { slug: string; source: string };
      subclass?: { slug: string; source: string } | null;
      hp: { method: 'average' | 'roll' };
      asiFeat?: AsiInput | FeatInput;
    }
  | {
      kind: 'new-class';
      class: { slug: string; source: string };
      subclass?: { slug: string; source: string } | null;
      skillChoices?: string[];
      toolChoices?: string[];
      hp: { method: 'average' | 'roll' };
    };

interface AsiInput {
  kind: 'asi';
  deltas: Partial<Record<string, number>>;
}

interface FeatInput {
  kind: 'feat';
  slug: string;
  source: string;
}

/**
 * Submit a level-up request for an active character.
 * Maps to POST /characters/:id/level-up.
 *
 * REQ-CLU-PLAY-TIME-AUTH: owner-only, active chars, no assertWritableForEdit.
 * On success, revalidates the sheet and returns the summary.
 */
export async function submitLevelUp(
  characterId: string,
  body: LevelUpBody,
): Promise<LevelUpState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    const res = await api.post<{ character: unknown; summary: LevelUpSummary }>(
      `/characters/${characterId}/level-up`,
      body,
      session.access_token,
    );
    revalidatePath(`/characters/${characterId}`);
    return { ok: true, summary: res.summary };
  } catch (err) {
    if (err instanceof ApiError) {
      const apiBody = err.body as {
        error?: string;
        issues?: Array<{ code: string; [key: string]: unknown }>;
      } | null;
      const firstIssue = apiBody?.issues?.[0];
      const message = firstIssue?.code
        ? `${firstIssue.code}`
        : apiBody?.error ?? `API ${err.status}`;
      return { ok: false, error: message, issues: apiBody?.issues };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
