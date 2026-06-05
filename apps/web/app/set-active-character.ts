'use server';

import { cookies } from 'next/headers';

/**
 * setActiveCharacter — server action that double-writes `dh:character` + `dh:world`.
 *
 * REQ-AC-ACT-01: Sets the active character id AND anchors the active world in one
 * atomic write so subsequent page renders pick up both via getActiveCharacter() and
 * getActiveWorld().
 *
 * Cookie attrs are identical to set-active-world.ts and the existing dh:role cookie:
 * client-readable (httpOnly: false), same-site lax, path root.
 *
 * worldId is passed from the client island — the roster row already carries worldId,
 * avoiding a server re-fetch in the action (ADR F-AFF rationale).
 */
export async function setActiveCharacter(
  characterId: string,
  worldId: string,
): Promise<void> {
  const cookieStore = await cookies();
  const ATTRS = { path: '/', sameSite: 'lax' as const, httpOnly: false };
  cookieStore.set('dh:character', characterId, ATTRS);
  cookieStore.set('dh:world', worldId, ATTRS);
  // REQ-DPPMC-LENS-01: clear GM view-overlay so the newly selected world
  // starts from its own callerRole default (not a stale overlay from another world).
  cookieStore.delete('dh:role');
}
