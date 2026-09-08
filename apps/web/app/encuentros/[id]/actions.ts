'use server';

// REQ-WCO-WEB-05 / REQ-WCO-WEB-06 — Route-local Server Actions for resource
// use/restore and rest (short/long). These wrap the owner-auth-gated API
// endpoints; real authorization is enforced server-side — no new gates needed here.
//
// Reuses EncounterActionResult union from the parent actions module so error
// handling is consistent across the encuentros feature.

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { networkErrorMessage } from '@/lib/error-message';
import type { EncounterActionResult } from '@/app/encuentros/actions';

const IdSchema = z.string().uuid();

// ─── activateRage ─────────────────────────────────────────────────────────────
// POST /encounters/:id/actions/activate-rage  { ragerId, version }
// REQ-WCR-WEB-ACT-01 — player activates own Barbarian rage (PHB p.48 — Rage)

export async function activateRage(
  encounterId: string,
  combatantId: string,
  version: number,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }
  if (!IdSchema.safeParse(combatantId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid combatant ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    await api.post(
      `/encounters/${encounterId}/actions/activate-rage`,
      { ragerId: combatantId, version },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { ok: false, code: 'FORBIDDEN' };
    }
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { error?: string } | null)?.error
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}

// ─── deactivateRage ───────────────────────────────────────────────────────────
// POST /encounters/:id/actions/deactivate-rage  { ragerId, version }
// REQ-WCR-WEB-ACT-01 — player ends own Barbarian rage (PHB p.48 — Rage: bonus action on own turn)

export async function deactivateRage(
  encounterId: string,
  combatantId: string,
  version: number,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }
  if (!IdSchema.safeParse(combatantId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid combatant ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    await api.post(
      `/encounters/${encounterId}/actions/deactivate-rage`,
      { ragerId: combatantId, version },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { ok: false, code: 'FORBIDDEN' };
    }
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { error?: string } | null)?.error
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}

// ─── passTurn ─────────────────────────────────────────────────────────────────
// POST /encounters/:id/actions/pass-turn  { version }
// REQ-WCPT-WEB-ACTION-01 — player passes own turn (PHB p.189 — VTT convenience).
// combatantId validated locally but NOT sent in body (body is { version } only).
// Authz is server-derived (currentCombatantId) — no caller-supplied combatantId needed.

export async function passTurn(
  encounterId: string,
  combatantId: string,
  version: number,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }
  if (!IdSchema.safeParse(combatantId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid combatant ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    await api.post(
      `/encounters/${encounterId}/actions/pass-turn`,
      { version },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { ok: false, code: 'FORBIDDEN' };
    }
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { error?: string } | null)?.error
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}

// ─── useResource ─────────────────────────────────────────────────────────────
// POST /characters/:id/resources/use  { slug, amount? }

export async function useResource(
  characterId: string,
  encounterId: string,
  slug: string,
  amount?: number,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(characterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid character ID' };
  }
  // FIX 4: validate encounterId to prevent path-traversal or bad revalidation paths
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    await api.post(
      `/characters/${characterId}/resources/use`,
      { slug, ...(amount !== undefined ? { amount } : {}) },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}

// ─── restoreResource ─────────────────────────────────────────────────────────
// POST /characters/:id/resources/restore  { slug, amount? }

export async function restoreResource(
  characterId: string,
  encounterId: string,
  slug: string,
  amount?: number,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(characterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid character ID' };
  }
  // FIX 4: validate encounterId to prevent path-traversal or bad revalidation paths
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    await api.post(
      `/characters/${characterId}/resources/restore`,
      { slug, ...(amount !== undefined ? { amount } : {}) },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}

// ─── shortRest ───────────────────────────────────────────────────────────────
// POST /characters/:id/rest/short  (PHB p.186 — Short Rest: 1+ hour, spend hit dice)

export async function shortRest(
  characterId: string,
  encounterId: string,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(characterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid character ID' };
  }
  // FIX 4: validate encounterId to prevent path-traversal or bad revalidation paths
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    // Empty object — not undefined: ShortRestBody is z.object({...}) and rejects
    // an undefined body ("expected object, received undefined"). Both fields are
    // optional, so {} means "short rest, spend no hit dice".
    await api.post(`/characters/${characterId}/rest/short`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}

// ─── attackApplyAction ────────────────────────────────────────────────────────
// POST /encounters/:id/actions/attack/apply  { attackerId, targetId, weaponInstanceId, version }
// REQ-WCA-WEB-SA-01 — player fires a one-shot weapon attack vs NPC target.
// PHB p.194-195: attack roll (d20 + bonus vs AC) → if hit, roll damage; server-authoritative.
// Returns the full attack result (hit/miss, d20, total, damage, newHp) so the sheet
// can display the outcome in the 'result' step.
// Error codes: FORBIDDEN(403), VERSION_CONFLICT(409→router.refresh), NOT_FOUND(404),
//              TARGET_NOT_NPC(400 VALIDATION_FAILED issues[0].code).

/** Success: full 200 body from the attack/apply route. */
export type AttackApplyResponse = {
  hit: boolean;
  d20?: number;
  total?: number;
  targetAc?: number;
  rolledDamage?: number;
  damageType?: string;
  newHp?: number;
  crit?: boolean;
};

export type AttackApplyActionResult =
  | { ok: true; result: AttackApplyResponse }
  | { ok: false; code: 'VERSION_CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND' | 'TARGET_NOT_NPC' | 'API_ERROR' | 'VALIDATION_FAILED'; message?: string };

export async function attackApplyAction(
  encounterId: string,
  attackerId: string,
  targetId: string,
  weaponInstanceId: string,
  version: number,
): Promise<AttackApplyActionResult> {
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }
  if (!IdSchema.safeParse(attackerId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid attacker ID' };
  }
  if (!IdSchema.safeParse(targetId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid target ID' };
  }
  if (!IdSchema.safeParse(weaponInstanceId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid weapon instance ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'FORBIDDEN', message: 'Not authenticated' };

  let result: AttackApplyResponse;
  try {
    result = await api.post<AttackApplyResponse>(
      `/encounters/${encounterId}/actions/attack/apply`,
      { attackerId, targetId, weaponInstanceId, version },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      return { ok: false, code: 'FORBIDDEN' };
    }
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    if (err instanceof ApiError && err.status === 404) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    if (err instanceof ApiError && err.status === 400) {
      // Inspect issues[0].code for TARGET_NOT_NPC
      const body = err.body as { issues?: Array<{ code: string }> } | null;
      const issueCode = body?.issues?.[0]?.code;
      if (issueCode === 'TARGET_NOT_NPC') {
        return { ok: false, code: 'TARGET_NOT_NPC' };
      }
      const msg = body?.issues?.[0]?.code;
      return { ok: false, code: 'API_ERROR', message: msg };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { error?: string } | null)?.error
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true, result };
}

// ─── longRest ────────────────────────────────────────────────────────────────
// POST /characters/:id/rest/long  (PHB p.186 — Long Rest: 8+ hours, full restore)

export async function longRest(
  characterId: string,
  encounterId: string,
): Promise<EncounterActionResult> {
  if (!IdSchema.safeParse(characterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid character ID' };
  }
  // FIX 4: validate encounterId to prevent path-traversal or bad revalidation paths
  if (!IdSchema.safeParse(encounterId).success) {
    return { ok: false, code: 'VALIDATION_FAILED', message: 'Invalid encounter ID' };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  try {
    await api.post(`/characters/${characterId}/rest/long`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : networkErrorMessage(err);
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}
