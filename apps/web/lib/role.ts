import { cookies } from 'next/headers';

export type Role = 'player' | 'dm';

/**
 * getRole() — server-side role detection via dh:role cookie.
 *
 * Returns 'dm' only when the cookie value is exactly 'dm'.
 * Everything else (missing, invalid, malformed) defaults to 'player'.
 *
 * REQ-RD-SERVER-UTIL-04 | REQ-RD-COOKIE-VALUES-02
 */
export async function getRole(): Promise<Role> {
  const cookieStore = await cookies();
  const value = cookieStore.get('dh:role')?.value;
  return value === 'dm' ? 'dm' : 'player';
}
