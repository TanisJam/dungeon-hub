import type { ActorRole } from '@dungeon-hub/domain/character/approval';
import type { LoadedCharacter } from './load-character.js';
import { getCharacterAccess } from './load-character.js';
import { assertWorldGm } from '../auth/assert-world-gm.js';

/**
 * Resolves the requesting user's actor role for a state-machine transition
 * on `character`. Combines owner check + gm worldMember check.
 *
 * Returns `null` when the user is neither owner nor gm in the character's
 * world — the API layer translates this to 403 FORBIDDEN.
 *
 * Origin: SDD `character-approval-flow` (engram #834).
 */
export async function resolveActorRole(
  character: LoadedCharacter,
  userId: string,
): Promise<ActorRole | null> {
  const [access, gmCheck] = await Promise.all([
    getCharacterAccess(character, userId),
    assertWorldGm(character.worldId, userId),
  ]);

  const isOwner = access === 'owner';
  const isGm = gmCheck.ok;

  if (isOwner && isGm) return 'owner-and-gm';
  if (isOwner) return 'owner';
  if (isGm) return 'gm';
  return null;
}
