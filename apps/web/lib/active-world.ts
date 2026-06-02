import { cookies } from 'next/headers';
import { api, getMyWorlds } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallerRole = 'gm' | 'player' | null;

export type ActiveWorld = {
  id: string;
  name: string;
  slug: string;
  callerRole: CallerRole;
};

type WorldDetailResponse = {
  world: {
    id: string;
    name: string;
    slug: string;
    callerRole: CallerRole;
  };
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a single world by id and return it as ActiveWorld.
 * Returns null on 403, 404, or any API error (stale/invalid id).
 */
async function fetchWorldById(
  worldId: string,
  token: string,
): Promise<ActiveWorld | null> {
  try {
    const res = await api.get<WorldDetailResponse>(`/worlds/${worldId}`, token);
    return {
      id: res.world.id,
      name: res.world.name,
      slug: res.world.slug,
      callerRole: res.world.callerRole,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the active world by falling back to the first world in the user's
 * list. Fetches world detail for callerRole. Returns null when the user has
 * zero worlds.
 */
async function fallbackToFirstWorld(token: string): Promise<ActiveWorld | null> {
  const worlds = await getMyWorlds(token).catch(() => [] as Awaited<ReturnType<typeof getMyWorlds>>);
  if (worlds.length === 0) return null;

  const first = worlds[0]!;
  // Fetch full world detail to get callerRole.
  const detail = await fetchWorldById(first.id, token);
  if (detail) return detail;

  // If detail fetch fails for the first world (edge case), return it without callerRole.
  return { id: first.id, name: first.name, slug: first.slug, callerRole: null };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * getActiveWorld(token) — resolves the active world for the authenticated user.
 *
 * Resolution order (REQ-WIS-01):
 * 1. Read `dh:world` cookie via next/headers cookies().
 *    If present → GET /worlds/:id; on success return it (incl. callerRole).
 * 2. If cookie absent OR GET returns non-200 (stale/revoked) →
 *    fall back to GET /worlds?mine=1 → first world → GET /worlds/:id for detail.
 * 3. If user has zero worlds → return null.
 *
 * MUST be called inside a Promise.all with other page-level fetches,
 * never as a serial await before them (latency).
 */
export async function getActiveWorld(token: string | undefined): Promise<ActiveWorld | null> {
  if (!token) return null;

  const cookieStore = await cookies();
  const worldIdCookie = cookieStore.get('dh:world')?.value;

  if (worldIdCookie) {
    const world = await fetchWorldById(worldIdCookie, token);
    if (world) return world;
    // Cookie stale (403/404) — fall through to fallback.
  }

  return fallbackToFirstWorld(token);
}
