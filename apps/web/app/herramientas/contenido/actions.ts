'use server';

// Custom content via JSON upload — items only (MVP #3.8, DEC-1 locked
// 2026-06-04: JSON upload, not visual authoring). Server Action per
// CLAUDE.md §7 — mutations here, not a route handler.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError, ApiNetworkError } from '@/lib/api';
import { parseHomebrewItemsJson } from './parse-items';

export interface UploadHomebrewState {
  status: 'idle' | 'success' | 'error';
  message: string | null;
  created?: number;
  updated?: number;
}

export const INITIAL_UPLOAD_STATE: UploadHomebrewState = { status: 'idle', message: null };

interface UploadHomebrewResponse {
  source: string;
  created: number;
  updated: number;
}

/**
 * Parses the pasted JSON, POSTs to /worlds/:worldId/homebrew/items, and
 * returns a typed result the form renders in Spanish. Never throws — every
 * failure path (bad JSON, no session, API error, network error) resolves
 * to a friendly `state.message` instead (brief: never a raw stack or a
 * bare "[object Object]").
 */
export async function uploadHomebrewItems(
  _prev: UploadHomebrewState,
  formData: FormData,
): Promise<UploadHomebrewState> {
  const worldId = String(formData.get('worldId') ?? '').trim();
  const raw = String(formData.get('itemsJson') ?? '');

  if (!worldId) {
    return { status: 'error', message: 'No hay un mundo activo — seleccioná uno primero.' };
  }

  const parsed = parseHomebrewItemsJson(raw);
  if (!parsed.ok) {
    return { status: 'error', message: parsed.error };
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { status: 'error', message: 'No autenticado — volvé a iniciar sesión.' };
  }

  try {
    const res = await api.post<UploadHomebrewResponse>(
      `/worlds/${worldId}/homebrew/items`,
      { items: parsed.items },
      session.access_token,
    );
    revalidatePath('/herramientas/contenido');
    return {
      status: 'success',
      message: `${res.created} item(s) creado(s), ${res.updated} actualizado(s).`,
      created: res.created,
      updated: res.updated,
    };
  } catch (err) {
    return { status: 'error', message: describeUploadError(err) };
  }
}

function describeUploadError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string; issues?: Array<{ message?: string }> } | null;
    if (body?.issues?.length) {
      const detail = body.issues
        .map((i) => i.message)
        .filter((m): m is string => Boolean(m))
        .join(' ');
      if (detail) return detail;
    }
    if (err.status === 403) return 'Solo el GM del mundo puede subir contenido homebrew.';
    return `Error de la API (${err.status}).`;
  }
  if (err instanceof ApiNetworkError) {
    return err.kind === 'timeout'
      ? 'El servidor tardó demasiado en responder. Probá de nuevo en unos segundos.'
      : 'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.';
  }
  return 'Error desconocido al subir el contenido.';
}
