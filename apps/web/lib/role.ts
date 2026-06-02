import { cookies } from 'next/headers';

export type Role = 'player' | 'dm';

/**
 * getRole() — server-side role detection via dh:role cookie.
 *
 * Returns 'dm' only when the cookie value is exactly 'dm'.
 * Everything else (missing, invalid, malformed) defaults to 'player'.
 *
 * @deprecated Use `getActiveWorld(token).callerRole` for per-world role authority
 * in world-scoped pages (inicio, campanas, encuentros). As of Slice 3 of world-ia-shell,
 * those pages derive view from `callerRole` (from the API), not from this cookie.
 * getRole() is KEPT as the GM-only view-preference overlay source for non-world pages
 * and for the client-side RoleSwitcher (which still writes dh:role). Do NOT delete.
 *
 * REQ-RD-SERVER-UTIL-04 | REQ-RD-COOKIE-VALUES-02
 */
export async function getRole(): Promise<Role> {
  const cookieStore = await cookies();
  const value = cookieStore.get('dh:role')?.value;
  return value === 'dm' ? 'dm' : 'player';
}

/**
 * getViewPreference() — raw `dh:role` cookie value, distinguishing "absent" from "player".
 *
 * Used by world-scoped pages to compute the GM-only view overlay:
 *   - A GM with NO preference defaults to DM view (seeded from callerRole).
 *   - A GM who explicitly toggled to "Jugador" (cookie === 'player') sees player view.
 * Unlike getRole(), this does NOT collapse absent→'player', so the GM default works.
 * Returns null when the cookie is absent/invalid.
 */
export async function getViewPreference(): Promise<Role | null> {
  const value = (await cookies()).get('dh:role')?.value;
  return value === 'dm' || value === 'player' ? value : null;
}
