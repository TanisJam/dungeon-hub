import type { CharacterAccess } from './load-character.js';

/**
 * Result of `assertWritableForEdit`. Caller maps each issue code to:
 *   - `NOT_OWNER`         → 403 FORBIDDEN
 *   - `CHARACTER_LOCKED`  → 409 CONFLICT { status }
 *
 * Origin: SDD `character-approval-flow` (engram #834). Closes
 * REQ-CAF-LOCK-WIZARD-EDITS from spec #833.
 */
export type WritableIssue =
  | { code: 'NOT_OWNER' }
  | { code: 'CHARACTER_LOCKED'; status: 'active' | 'retired' | 'dead' };

export type WritableResult = { ok: true } | { ok: false; issues: WritableIssue[] };

const LOCKED_STATUSES = new Set<'active' | 'retired' | 'dead'>(['active', 'retired', 'dead']);

/**
 * Pure synchronous gate for the 8 wizard-shape write endpoints. Receives the
 * already-resolved `access` (from `getCharacterAccess`) and the character's
 * current `status`. Returns `ok: true` when:
 *   1. access === 'owner', AND
 *   2. status NOT in {active, retired, dead}.
 *
 * Play-time endpoints (HP / rest / resources / spell-slots / inventory / xp)
 * do NOT call this helper — they intentionally keep working when status is
 * `active` per REQ-CAF-PLAY-TIME-UNLOCKED.
 *
 * Pure helper (no IO) — caller already loaded `character`, so we avoid a
 * second `getCharacterAccess` DB roundtrip.
 */
export function assertWritableForEdit(
  access: CharacterAccess,
  status: string,
): WritableResult {
  if (access !== 'owner') {
    return { ok: false, issues: [{ code: 'NOT_OWNER' }] };
  }
  if (LOCKED_STATUSES.has(status as 'active' | 'retired' | 'dead')) {
    return {
      ok: false,
      issues: [
        { code: 'CHARACTER_LOCKED', status: status as 'active' | 'retired' | 'dead' },
      ],
    };
  }
  return { ok: true };
}
