'use server';

import { cookies } from 'next/headers';

/**
 * setActiveWorld — server action that writes the `dh:world` cookie.
 *
 * REQ-WIS-02: Sets the active world id in a client-readable cookie so that
 * subsequent page renders pick up the new active world via getActiveWorld().
 *
 * Cookie attrs mirror the dh:role cookie (client-readable, same-site lax).
 * httpOnly: false — no secret value; mirrors dh:role which is client-readable.
 */
export async function setActiveWorld(worldId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set('dh:world', worldId, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  });
  // REQ-DPPMC-LENS-01: clear the GM view-overlay cookie so the new world
  // starts from its own callerRole default (not leaked from the previous world).
  cookieStore.delete('dh:role');
}
