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
import type { EncounterActionResult } from '@/app/encuentros/actions';

const IdSchema = z.string().uuid();

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
        : undefined;
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
        : undefined;
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
    await api.post(`/characters/${characterId}/rest/short`, undefined, session.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : undefined;
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
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
    await api.post(`/characters/${characterId}/rest/long`, undefined, session.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { ok: false, code: 'VERSION_CONFLICT' };
    }
    const msg =
      err instanceof ApiError
        ? (err.body as { message?: string } | null)?.message
        : undefined;
    return { ok: false, code: 'API_ERROR', message: msg };
  }

  revalidatePath(`/encuentros/${encounterId}`);
  return { ok: true };
}
