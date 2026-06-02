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
