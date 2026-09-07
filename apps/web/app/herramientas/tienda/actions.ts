'use server';

// Tienda Server Actions — DM shop curation (market-shop-dm-stock-web, sub-slice 3d).
// Mirrors the token-handling pattern in ../actions.ts (Facciones/NPCs) and
// ../quests/actions.ts (revalidatePath + Bearer JWT forwarding).

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError, ApiNetworkError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Shared helpers (re-declared locally — actions files are page-local)
// ---------------------------------------------------------------------------

async function getToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function handleApiError(err: unknown): ActionResult<never> {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string; error?: string } | null;
    return {
      ok: false,
      error: body?.message ?? body?.error ?? `API ${err.status}`,
      status: err.status,
    };
  }
  if (err instanceof ApiNetworkError) {
    return {
      ok: false,
      error:
        err.kind === 'timeout'
          ? 'El servidor tardó demasiado en responder. Probá de nuevo en unos segundos.'
          : 'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.',
    };
  }
  return {
    ok: false,
    error: err instanceof Error ? err.message : 'Error desconocido',
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShopCuration {
  enabled: boolean;
  forSale: string[];
}

export interface ShopListingsBody {
  enabled?: boolean;
  forSale?: string[];
}

// ---------------------------------------------------------------------------
// setShopListings — GM-only. PATCH /worlds/:id/shop-listings.
// Both fields optional — a partial update MERGEs against the current
// shopCuration server-side (omitted fields keep their existing value).
// ---------------------------------------------------------------------------

export async function setShopListings(
  worldId: string,
  body: ShopListingsBody,
): Promise<ActionResult<ShopCuration>> {
  const token = await getToken();
  if (!token) return { ok: false, error: 'No autenticado', status: 401 };

  try {
    const updated = await api.patch<{ shopCuration: ShopCuration }>(
      `/worlds/${worldId}/shop-listings`,
      body,
      token,
    );
    revalidatePath('/herramientas/tienda');
    return { ok: true, data: updated.shopCuration };
  } catch (err) {
    return handleApiError(err);
  }
}
