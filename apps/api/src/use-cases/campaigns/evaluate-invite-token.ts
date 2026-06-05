/**
 * evaluateInviteToken — pure predicate for campaign invite token state.
 *
 * No IO. Accepts a token row snapshot and a reference time; returns one of:
 *   'OK'       — token is valid and can be accepted
 *   'EXPIRED'  — token's TTL has passed
 *   'CONSUMED' — token has been revoked or its use-count is exhausted
 *
 * Guard order (design ADR-4):
 *   1. revokedAt — explicit admin revocation wins first
 *   2. useCount >= maxUses — exhausted single/limited-use
 *   3. expiresAt < now — TTL expired
 *   All three clear → OK
 *
 * maxUses=null means unlimited (multi-use). The consumed guard short-circuits
 * safely: `maxUses != null && useCount >= maxUses`.
 *
 * REQ-INV-CONFIRM-01 (TOCTOU re-validation inside transaction),
 * REQ-INV-STATUS-01 (status discrimination).
 */
export interface InviteTokenRow {
  expiresAt: Date;
  revokedAt: Date | null;
  maxUses: number | null;
  useCount: number;
}

export function evaluateInviteToken(
  row: InviteTokenRow,
  now: Date,
): 'OK' | 'EXPIRED' | 'CONSUMED' {
  if (row.revokedAt != null) {
    return 'CONSUMED';
  }
  if (row.maxUses != null && row.useCount >= row.maxUses) {
    return 'CONSUMED';
  }
  if (row.expiresAt < now) {
    return 'EXPIRED';
  }
  return 'OK';
}
