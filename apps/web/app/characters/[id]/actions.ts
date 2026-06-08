'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import type { InventoryDetailResponse } from '@/lib/sheet-types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DeleteState = { ok: false; error: string } | { ok: true };

// ── SP-05: Spell slot consumption ────────────────────────────────────────────

export type SlotActionState = { ok: false; error: string } | { ok: true };

/**
 * Consume one spell slot of the given level and type.
 * PHB p.201 — "you expend a spell slot to cast a spell of that level or higher."
 */
export async function useSpellSlot(
  characterId: string,
  level: number,
  slotType: 'regular' | 'pact',
): Promise<SlotActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/spell-slots/use`, { level, slotType }, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Perform a long rest for the character.
 * PHB p.186 — restores HP to max, half of total hit dice, and all expended spell slots
 * (except warlock pact slots, which recover on short rest).
 */
export async function longRest(characterId: string): Promise<SlotActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/rest/long`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Perform a short rest for the character.
 * PHB p.186 + p.107 — restores warlock pact slots; does NOT restore regular spell slots.
 */
export async function shortRest(characterId: string): Promise<SlotActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/rest/short`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

// ── R-07: Class-resource actions (Second Wind, Ki, etc.) ────────────────────

export type ResourceActionState = { ok: false; error: string } | { ok: true };

/**
 * Consume 1 use of a class resource. Maps to POST /resources/use.
 * On error returns the API error message for the calling Client Component.
 */
export async function useClassResource(
  characterId: string,
  slug: string,
  amount?: number,
): Promise<ResourceActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(
      `/characters/${characterId}/resources/use`,
      amount !== undefined ? { slug, amount } : { slug },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/** Restore N uses of a class resource (floors at 0). Maps to POST /resources/restore. */
export async function restoreClassResource(
  characterId: string,
  slug: string,
  amount?: number,
): Promise<ResourceActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(
      `/characters/${characterId}/resources/restore`,
      amount !== undefined ? { slug, amount } : { slug },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

// ── INV-04: Inventory mutations + compendium item search ────────────────────

export type InventoryActionState = { ok: false; error: string } | { ok: true };

export type CompendiumItemHit = {
  slug: string;
  source: string;
  name: string;
  type: string | null;
  weight: number | null;
};

/**
 * Search compendium items scoped to the character's world.
 * Maps to GET /compendium/items?world=<characterWorldId>&q=<term>.
 * Server Action so the browser island doesn't have to handle Supabase tokens.
 */
export async function searchCompendiumItems(
  worldId: string,
  q: string,
): Promise<CompendiumItemHit[]> {
  if (!UUID_RE.test(worldId)) return [];
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  type Envelope = { data: CompendiumItemHit[]; total: number };
  try {
    const params = new URLSearchParams({
      world: worldId,
      q: trimmed,
      limit: '50',
    });
    const res = await api.get<Envelope>(
      `/compendium/items?${params.toString()}`,
      session.access_token,
    );
    return res.data;
  } catch {
    return [];
  }
}

/**
 * Add an item to the character's inventory.
 * Maps to POST /characters/:id/inventory.
 *
 * REQ-INV-ADD-ITEM (spec #843 — inventory-foundation).
 */
export async function addInventoryItem(
  characterId: string,
  item: { slug: string; source: string },
  qty: number = 1,
): Promise<InventoryActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(
      `/characters/${characterId}/inventory`,
      { item, quantity: qty },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Update an existing inventory item (equip toggle, qty, etc.).
 * Maps to PATCH /characters/:id/inventory/:instanceId.
 *
 * REQ-INV-EQUIP-TOGGLE.
 */
export async function updateInventoryItem(
  characterId: string,
  instanceId: string,
  patch: {
    state?: 'equipped' | 'carried' | 'stowed';
    quantity?: number;
    equipHand?: 'main' | 'off' | 'both' | null;
  },
): Promise<InventoryActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }
  if (!UUID_RE.test(instanceId)) {
    return { ok: false, error: 'ID de ítem inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.patch(
      `/characters/${characterId}/inventory/${instanceId}`,
      patch,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Remove an inventory line.
 * Maps to DELETE /characters/:id/inventory/:instanceId.
 *
 * REQ-INV-REMOVE-ITEM.
 */
export async function removeInventoryItem(
  characterId: string,
  instanceId: string,
): Promise<InventoryActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }
  if (!UUID_RE.test(instanceId)) {
    return { ok: false, error: 'ID de ítem inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.delete(
      `/characters/${characterId}/inventory/${instanceId}`,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

// ── DM approval actions (SDD dm-session-panel — REQ-CAU-*) ───────────────────

export type ApprovalActionState = { ok: false; error: string } | { ok: true };

/**
 * GM approves a pending character. Flips status `pending_approval → active`.
 * SDD dm-session-panel — REQ-CAU-APPROVE-BUTTON (spec #857).
 *
 * Maps to existing POST /characters/:id/approve. Revalidates both the
 * character sheet and the world landing so the row disappears from the
 * Pendientes tab on next visit.
 */
export async function approveCharacter(
  characterId: string,
): Promise<ApprovalActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/approve`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  revalidatePath(`/worlds/[id]`, 'page');
  return { ok: true };
}

/**
 * GM rejects a character. Used for both:
 *   - REQ-CAU-REJECT-BUTTON: pending → draft (player must re-submit)
 *   - REQ-CAU-REVERT-BUTTON: active → draft (GM revert path)
 *
 * Maps to existing POST /characters/:id/reject. The api endpoint accepts both
 * source statuses (pending_approval and active) per character-approval-flow.
 */
export async function rejectCharacter(
  characterId: string,
): Promise<ApprovalActionState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/reject`, {}, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  revalidatePath(`/worlds/[id]`, 'page');
  return { ok: true };
}

// ── DM grant actions (SDD dm-session-grants — REQ-CDG-*) ────────────────────

export type GrantState = { ok: false; error: string } | { ok: true };

/**
 * DM grants XP to a character.
 * Maps to POST /characters/:id/xp.
 * REQ-CDG-XP-FORM (spec #867 — dm-session-grants).
 */
export async function grantXp(characterId: string, award: number): Promise<GrantState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/xp`, { award }, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * DM grants gold (coin deltas) to a character.
 * Maps to POST /characters/:id/grant/gold.
 * REQ-CDG-GOLD-FORM (spec #867 — dm-session-grants).
 */
export async function grantGold(
  characterId: string,
  deltas: Partial<Record<'cp' | 'sp' | 'ep' | 'gp' | 'pp', number>>,
): Promise<GrantState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(`/characters/${characterId}/grant/gold`, deltas, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * DM grants an item to a character.
 * Maps to POST /characters/:id/grant/item.
 * REQ-CDG-ITEM-FORM (spec #867 — dm-session-grants).
 */
export async function grantItem(
  characterId: string,
  item: { slug: string; source: string },
  quantity: number,
): Promise<GrantState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(
      `/characters/${characterId}/grant/item`,
      { item, quantity },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

// ── Existing actions ──────────────────────────────────────────────────────────

export async function deleteCharacter(characterId: string): Promise<DeleteState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.delete(`/characters/${characterId}`, session.access_token);
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath('/characters');
  redirect('/');
}

// ── FIX 2: Inventory item detail fetch via Server Action ─────────────────────

export type FetchInventoryDetailResult =
  | { ok: true; detail: InventoryDetailResponse }
  | { ok: false; error: string };

/**
 * Fetch inventory item detail via the Fastify API with server-side auth.
 * Replaces the client-side relative fetch in InventoryDetailIsland that caused
 * 404 (wrong base URL) + 401 (no auth header).
 *
 * Maps to GET /characters/:id/inventory/:instanceId/detail (Fastify :4000).
 * FIX 2 — WIDI-ISLAND-01 (spec #1070).
 */
export async function fetchInventoryDetail(
  characterId: string,
  instanceId: string,
): Promise<FetchInventoryDetailResult> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }
  if (!UUID_RE.test(instanceId)) {
    return { ok: false, error: 'ID de instancia inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    const res = await api.get<{ detail: InventoryDetailResponse }>(
      `/characters/${characterId}/inventory/${instanceId}/detail`,
      session.access_token,
    );
    return { ok: true, detail: res.detail };
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `Error ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

// ── character-codex: knowledge grant ─────────────────────────────────────────

export type GrantKnowledgeState = { ok: false; error: string } | { ok: true };


export type KnowledgeKind = 'bestiary' | 'item' | 'spell' | 'npc' | 'faction' | 'location' | 'lore';

/**
 * DM-only: grant a knowledge entry to a character.
 * Maps to POST /characters/:id/knowledge.
 * Idempotent — double-grant = no error.
 *
 * REQ-CK-API-01 (spec #1626, character-codex)
 */
export async function grantKnowledge(
  characterId: string,
  entry: { kind: KnowledgeKind; refKey: string; refSource: string },
): Promise<GrantKnowledgeState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(
      `/characters/${characterId}/knowledge`,
      { kind: entry.kind, refKey: entry.refKey, refSource: entry.refSource },
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string; error?: string } | null;
      return { ok: false, error: body?.message ?? body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

// ── bitacora-personal: page CRUD ──────────────────────────────────────────────

export type BitacoraPageState =
  | { ok: true }
  | { ok: false; error: string; issues?: Array<{ code: string; message: string; path?: string }> };

export interface CreateBitacoraPageInput {
  title?: string | null | undefined;
  body: string;
  tags: string[];
  refs: Array<{ kind: string; refKey: string; refSource: string }>;
}

export interface UpdateBitacoraPageInput {
  title?: string | null | undefined;
  body?: string | undefined;
  tags?: string[] | undefined;
  refs?: Array<{ kind: string; refKey: string; refSource: string }> | undefined;
}

/**
 * Create a personal bitácora page for the given character.
 * REQ-BP-WEB-04 (spec #1974), bitacora-personal SDD.
 */
export async function createBitacoraPage(
  characterId: string,
  input: CreateBitacoraPageInput,
): Promise<BitacoraPageState> {
  if (!UUID_RE.test(characterId)) {
    return { ok: false, error: 'ID de personaje inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.post(
      `/characters/${characterId}/bitacora/pages`,
      input,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string; issues?: Array<{ code: string; message: string; path?: string }> } | null;
      return {
        ok: false,
        error: body?.error ?? `API ${err.status}`,
        issues: body?.issues,
      };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Update a personal bitácora page (partial update).
 * REQ-BP-WEB-04 (spec #1974), bitacora-personal SDD.
 */
export async function updateBitacoraPage(
  characterId: string,
  pageId: string,
  input: UpdateBitacoraPageInput,
): Promise<BitacoraPageState> {
  if (!UUID_RE.test(characterId) || !UUID_RE.test(pageId)) {
    return { ok: false, error: 'ID inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.patch(
      `/characters/${characterId}/bitacora/pages/${pageId}`,
      input,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string; issues?: Array<{ code: string; message: string; path?: string }> } | null;
      return {
        ok: false,
        error: body?.error ?? `API ${err.status}`,
        issues: body?.issues,
      };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

/**
 * Delete a personal bitácora page.
 * REQ-BP-WEB-06 (spec #1974), bitacora-personal SDD.
 */
export async function deleteBitacoraPage(
  characterId: string,
  pageId: string,
): Promise<BitacoraPageState> {
  if (!UUID_RE.test(characterId) || !UUID_RE.test(pageId)) {
    return { ok: false, error: 'ID inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    await api.delete(
      `/characters/${characterId}/bitacora/pages/${pageId}`,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string } | null;
      return { ok: false, error: body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }

  revalidatePath(`/characters/${characterId}`);
  return { ok: true };
}

// ── bitacora-personal-share: share a personal page to the guild ───────────────

export type ShareBitacoraPageState =
  | { ok: false; error: string }
  | { ok: true; contributionId: string; alreadyShared: boolean };

/**
 * Share a personal bitácora page to the guild feed.
 *
 * Idempotent: re-sharing a non-sealed page returns the existing contribution (no-op).
 * On success, revalidates the guild feed (/bitacora) and the character page.
 *
 * REQ-SHARE-07/10 bitacora-personal-share SDD spec #2035.
 */
export async function shareBitacoraPage(
  characterId: string,
  pageId: string,
): Promise<ShareBitacoraPageState> {
  if (!UUID_RE.test(characterId) || !UUID_RE.test(pageId)) {
    return { ok: false, error: 'ID inválido.' };
  }

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'No autenticado.' };

  try {
    const res = await api.post<{ contributionId: string; alreadyShared: boolean }>(
      `/characters/${characterId}/bitacora/pages/${pageId}/share`,
      {},
      session.access_token,
    );
    revalidatePath('/bitacora');
    revalidatePath(`/characters/${characterId}`, 'layout');
    return { ok: true, contributionId: res.contributionId, alreadyShared: res.alreadyShared };
  } catch (err) {
    if (err instanceof ApiError) {
      const body = err.body as { error?: string } | null;
      return { ok: false, error: body?.error ?? `API ${err.status}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
