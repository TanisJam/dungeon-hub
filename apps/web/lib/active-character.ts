import { cookies } from 'next/headers';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActiveCharacter = {
  id: string;
  name: string;
  worldId: string;
  status: string;
  lineage: string;
  hpCurrent: number | null;
  hpMax: number | null;
};

// GET /characters?status=active returns { data: RosterCharacter[] }.
// We only project the fields we need.
type RosterCharacterRow = {
  id: string;
  name: string;
  worldId: string;
  status: string;
  lineage: string;
  hpCurrent: number | null;
  hpMax: number | null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getActiveCharacter(token) — resolves the active character for the authenticated user.
 *
 * Resolution order (REQ-AC-RES-01):
 * 1. Guard on !token → return null immediately.
 * 2. Read `dh:character` and `dh:world` cookies via next/headers cookies().
 * 3. Fetch GET /characters?status=active (single call — roster already has all needed fields).
 * 4. If dh:character cookie present → find roster row where:
 *      id === dh:character AND status === 'active' AND (no dh:world OR worldId === dh:world)
 *    If found → return it.
 * 5. Fallback: return first roster row where:
 *      status === 'active' AND (no dh:world OR worldId === dh:world)
 * 6. If none → return null.
 *
 * MUST be called inside a Promise.all / Promise.allSettled with other page-level
 * fetches, never as a serial await before them (REQ-AC-RES-02 latency mitigation).
 * Reads dh:world DIRECTLY via cookies() — does NOT depend on a resolved ActiveWorld
 * object, so it is safe inside Promise.all.
 */
export async function getActiveCharacter(
  token: string | undefined,
): Promise<ActiveCharacter | null> {
  if (!token) return null;

  const cookieStore = await cookies();
  const characterCookie = cookieStore.get('dh:character')?.value;
  const worldCookie = cookieStore.get('dh:world')?.value;

  // Single fetch — roster already contains all fields the card needs.
  // ADR F-SHAPE: one GET /characters?status=active, no separate /characters/:id call.
  const rosterRes = await api
    .get<{ data: RosterCharacterRow[] }>('/characters?status=active', token)
    .catch(() => null);

  const roster: RosterCharacterRow[] = rosterRes?.data ?? [];

  // Helper: a row passes the world filter when no dh:world cookie is set (no
  // constraint) OR the row belongs to the active world.
  const matchesWorld = (row: RosterCharacterRow): boolean =>
    !worldCookie || row.worldId === worldCookie;

  // Step 1: try to validate the cookie character (ADR F-LIFECYCLE).
  if (characterCookie) {
    const matched = roster.find(
      (row) =>
        row.id === characterCookie &&
        row.status === 'active' &&
        matchesWorld(row),
    );
    if (matched) return toActiveCharacter(matched);
    // Cookie is stale / cross-world / non-active → fall through to fallback.
  }

  // Step 2: fallback to first active char in the active world (or any world if no cookie).
  const fallback = roster.find((row) => row.status === 'active' && matchesWorld(row));
  return fallback ? toActiveCharacter(fallback) : null;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function toActiveCharacter(row: RosterCharacterRow): ActiveCharacter {
  return {
    id: row.id,
    name: row.name,
    worldId: row.worldId,
    status: row.status,
    lineage: row.lineage,
    hpCurrent: row.hpCurrent,
    hpMax: row.hpMax,
  };
}
