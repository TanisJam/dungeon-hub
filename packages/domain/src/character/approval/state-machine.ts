/**
 * Character approval state machine — pure validator for `character.status`
 * transitions.
 *
 * Closes MVP §3.B2: characters are born `draft`, the owner publishes to
 * `pending_approval`, some DM approves to `active`, and the DM can revert
 * `active → draft` if a fix is needed. Owner can self-cancel a pending
 * publish.
 *
 * Origin: SDD `character-approval-flow` (engram #834). The API layer maps:
 *   - `ILLEGAL_TRANSITION` → 409 CONFLICT
 *   - `FORBIDDEN_FOR_ACTOR` → 403 FORBIDDEN
 */

export type CharacterStatus = 'draft' | 'pending_approval' | 'active' | 'retired' | 'dead';

/**
 * Actor role for a transition request. `'owner-and-gm'` covers the solo-testing
 * case where the same user is both the character's owner AND a gm worldMember
 * of its world — the state machine accepts whichever role unlocks the
 * transition (gm-permit applies in case of overlap).
 */
export type ActorRole = 'owner' | 'gm' | 'owner-and-gm';

export type TransitionIssue =
  | { code: 'ILLEGAL_TRANSITION'; from: CharacterStatus; to: CharacterStatus }
  | {
      code: 'FORBIDDEN_FOR_ACTOR';
      from: CharacterStatus;
      to: CharacterStatus;
      requiredActor: 'owner' | 'gm';
    };

export type TransitionResult = { ok: true } | { ok: false; issues: TransitionIssue[] };

/**
 * Required actor for each legal `(from → to)` pair.
 *   - `'owner'`: only the character owner may initiate.
 *   - `'gm'`: only a gm-role worldMember may initiate.
 *   - `'any'`: either owner or gm may initiate.
 *
 * Absence of a key for `from → to` means the transition is illegal.
 */
type RequiredActor = 'owner' | 'gm' | 'any';

const LEGAL_TRANSITIONS: Readonly<Record<CharacterStatus, Partial<Record<CharacterStatus, RequiredActor>>>> = {
  draft: {
    pending_approval: 'owner',
  },
  pending_approval: {
    draft: 'any', // owner self-cancel OR gm reject
    active: 'gm', // only gm can approve
  },
  active: {
    draft: 'gm', // DM revert for re-edit workflow
    retired: 'any', // owner retires their char, OR gm retires it
    dead: 'gm', // only DM can mark dead
  },
  retired: {},
  dead: {},
};

function matchesRequired(actor: ActorRole, required: RequiredActor): boolean {
  if (required === 'any') return true;
  if (required === 'gm') return actor === 'gm' || actor === 'owner-and-gm';
  // required === 'owner'
  return actor === 'owner' || actor === 'owner-and-gm';
}

/**
 * Validates whether `actor` may transition the character from `from` to `to`.
 *
 * Returns `{ ok: true }` when the transition is legal AND the actor has the
 * required role. Returns `{ ok: false, issues }` otherwise — issues are
 * mutually exclusive (either illegal-transition OR forbidden-actor, not both).
 */
export function validateCharacterTransition(
  from: CharacterStatus,
  to: CharacterStatus,
  actor: ActorRole,
): TransitionResult {
  const required = LEGAL_TRANSITIONS[from]?.[to];
  if (required === undefined) {
    return { ok: false, issues: [{ code: 'ILLEGAL_TRANSITION', from, to }] };
  }
  if (!matchesRequired(actor, required)) {
    const requiredActor: 'owner' | 'gm' = required === 'any' ? 'owner' : required;
    return {
      ok: false,
      issues: [{ code: 'FORBIDDEN_FOR_ACTOR', from, to, requiredActor }],
    };
  }
  return { ok: true };
}
