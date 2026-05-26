/**
 * World GM membership validator.
 *
 * Pure function — no IO, no DB. The caller (use-case) loads the worldMembers
 * rows from the database and passes them in as a plain array.
 *
 * Authority model: a user is a GM of a world when they have a `worldMembers`
 * row with `role = 'gm'` for that specific worldId. Being a GM in a different
 * world does NOT grant authority here (world-scoped check).
 */

export type WorldMembership = {
  worldId: string;
  userId: string;
  role: 'gm' | 'player';
};

export type AssertWorldGmIssue = {
  code: 'WORLD_GM_REQUIRED';
  worldId: string;
  userId: string;
};

export type AssertWorldGmResult =
  | { ok: true }
  | { ok: false; issues: [AssertWorldGmIssue] };

/**
 * Asserts that `userId` is a GM of `worldId`.
 *
 * @param memberships - All worldMember rows for this user (or for this world).
 *   Passing only the relevant world's rows is acceptable and sufficient.
 * @param worldId    - The world whose GM authority is being checked.
 * @param userId     - The user being checked.
 *
 * @returns `{ ok: true }` when the user has a `role='gm'` membership for the
 *   given worldId, `{ ok: false, issues: [...] }` otherwise.
 */
export function assertWorldGm(
  memberships: WorldMembership[],
  worldId: string,
  userId: string,
): AssertWorldGmResult {
  const isGm = memberships.some(
    (m) => m.worldId === worldId && m.userId === userId && m.role === 'gm',
  );

  if (isGm) return { ok: true };

  return {
    ok: false,
    issues: [{ code: 'WORLD_GM_REQUIRED', worldId, userId }],
  };
}
