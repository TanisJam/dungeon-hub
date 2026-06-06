'use server';

/**
 * Settings Server Actions — user preferences.
 *
 * codex-knowledge B-4 (SDD tasks #1950, spec #1947, design #1948 §4.5):
 *   setDevMode — toggle users.devMode via POST /users/me/dev-mode (B-0 endpoint).
 *
 * REQ-CK-DEV-03: server-side persistence; no client-side localStorage or cookie.
 * REQ-CK-DEV-01: FORK 5 (#1944) — per-user, server-enforced.
 *
 * This arc encodes NO PHB rule.
 */

import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { revalidatePath } from 'next/cache';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function getToken(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function handleApiError(err: unknown): ActionResult<never> {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string; error?: string } | null;
    return {
      ok: false,
      error: body?.message ?? body?.error ?? `API ${err.status}`,
      status: err.status,
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : 'Error desconocido',
  };
}

/**
 * setDevMode — toggle the authenticated user's devMode flag.
 * Calls POST /users/me/dev-mode (B-0 endpoint).
 */
export async function setDevMode(
  devMode: boolean,
): Promise<ActionResult<{ devMode: boolean }>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const result = await api.post<{ devMode: boolean }>(
      '/users/me/dev-mode',
      { devMode },
      token,
    );
    // Revalidate pages that depend on devMode (codex pages, etc.)
    revalidatePath('/codex');
    return { ok: true, data: result };
  } catch (err) {
    return handleApiError(err);
  }
}
