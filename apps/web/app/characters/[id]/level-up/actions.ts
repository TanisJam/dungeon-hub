'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LevelUpState =
  | { ok: false; error: string; issues?: Array<{ code: string; [key: string]: unknown }> }
  | { ok: true; summary: LevelUpSummary }
  | { ok: 'partial'; summary: LevelUpSummary; spellsError: { code: string; message: string } };

export interface LevelUpSummary {
  classSlug: string;
  fromClassLevel: number;
  toClassLevel: number;
  totalLevelAfter: number;
  hpDelta: number;
  rollUsed: number | null;
  asiFeatApplied?: 'asi' | 'feat';
}

export interface AppliedClassSpellsForAction {
  cantrips: Array<{ slug: string; source: string }>;
  known: Array<{ slug: string; source: string }>;
  prepared: Array<{ slug: string; source: string }>;
}

export type LevelUpBody =
  | {
      kind: 'same-class';
      class: { slug: string; source: string };
      subclass?: { slug: string; source: string } | null;
      hp: { method: 'average' | 'roll' };
      asiFeat?: AsiInput | FeatInput;
      /**
       * Spell picks for Phase 2 submit (PUT /classes/:slug/spells).
       * Passed when the spells step is active. null = no spell step.
       * @deprecated spellPicks is handled client-side in a two-phase submit;
       * the level-up API route never reads this field.
       */
      spellPicks?: AppliedClassSpellsForAction | null;
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
 * Maps to POST /characters/:id/level-up (Phase 1).
 *
 * If `body.spellPicks` is present (same-class path with spells step active),
 * Phase 2 calls PUT /characters/:id/classes/:slug/spells after Phase 1 succeeds.
 * On Phase 2 failure: returns { ok: 'partial', summary, spellsError }.
 *
 * REQ-CLU-PLAY-TIME-AUTH, REQ-CLU-SPL-TWO-PHASE-SUBMIT.
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

  // ---- Phase 1: POST /level-up -----------------------------------------------
  let summary: LevelUpSummary;
  try {
    const res = await api.post<{ character: unknown; summary: LevelUpSummary }>(
      `/characters/${characterId}/level-up`,
      body,
      session.access_token,
    );
    summary = res.summary;
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

  // ---- Phase 2: PUT /classes/:slug/spells (if spell picks present) ------------
  const spellPicks = body.kind === 'same-class' ? body.spellPicks : null;
  if (spellPicks) {
    try {
      await api.put(
        `/characters/${characterId}/classes/${body.class.slug}/spells`,
        spellPicks,
        session.access_token,
      );
    } catch (err) {
      // Phase 1 already succeeded — character is leveled up. Return partial success.
      const code = err instanceof ApiError
        ? String((err.body as { error?: string } | null)?.error ?? err.status)
        : 'SPELLS_SAVE_FAILED';
      const message = err instanceof ApiError
        ? String((err.body as { message?: string } | null)?.message ?? 'Error al guardar hechizos')
        : (err instanceof Error ? err.message : 'Error desconocido');
      revalidatePath(`/characters/${characterId}`);
      return { ok: 'partial', summary, spellsError: { code, message } };
    }
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true, summary };
}

// ── Spell options types ───────────────────────────────────────────────────────

export interface SpellOptionsResult {
  availableSpells: Array<{
    slug: string;
    source: string;
    name: string;
    level: number;
    school: string;
    ritual: boolean;
    concentration: boolean;
    componentsM: boolean;
    componentsMCost: number | null;
  }>;
  subclassGrantedSlugs: string[];
}

/**
 * Fetches available spell options for a class on a character.
 * Used by SpellsStep on mount to populate the spell picker.
 * Calls GET /characters/:id/classes/:classSlug/spells/options.
 *
 * NOTE: The endpoint returns limits based on the CURRENT class level.
 * For the level-up spells step, pass limits from FlowCtx (computed at toLevel)
 * to override the picker's limit — availableSpells is still correct (same pool).
 */
export async function getSpellOptions(
  characterId: string,
  classSlug: string,
): Promise<SpellOptionsResult | null> {
  if (!UUID_RE.test(characterId)) return null;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  try {
    const res = await api.get<{
      limits: unknown;
      availableSpells: SpellOptionsResult['availableSpells'];
      subclassGrantedSlugs: string[];
    }>(
      `/characters/${characterId}/classes/${classSlug}/spells/options`,
      session.access_token,
    );
    return {
      availableSpells: res.availableSpells,
      subclassGrantedSlugs: res.subclassGrantedSlugs,
    };
  } catch {
    return null;
  }
}

/**
 * Idempotent retry of Phase 2 spell save.
 * Called from the partial-success banner "Reintentar" button.
 * Maps to PUT /characters/:id/classes/:slug/spells.
 *
 * REQ-CLU-SPL-TWO-PHASE-SUBMIT.
 */
export async function retrySaveSpells(
  characterId: string,
  classSlug: string,
  spellPicks: AppliedClassSpellsForAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.put(
      `/characters/${characterId}/classes/${classSlug}/spells`,
      spellPicks,
      session.access_token,
    );
    revalidatePath(`/characters/${characterId}`);
    return { ok: true };
  } catch (err) {
    const code = err instanceof ApiError
      ? String((err.body as { error?: string } | null)?.error ?? err.status)
      : 'SPELLS_SAVE_FAILED';
    return { ok: false, error: code };
  }
}
