/**
 * evaluate-invite-token.test.ts — Strict TDD unit tests for the pure
 * evaluateInviteToken predicate.
 *
 * No IO. No DB. The function accepts a token row snapshot and a reference
 * time and returns 'OK' | 'EXPIRED' | 'CONSUMED'.
 *
 * Covers REQ-INV-CONFIRM-01 (token state discrimination) and
 * REQ-INV-STATUS-01 (guard order per design ADR-4).
 */
import { describe, expect, it } from 'vitest';
import { evaluateInviteToken } from './evaluate-invite-token.js';

type TokenRow = Parameters<typeof evaluateInviteToken>[0];

const base = (): TokenRow => ({
  expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000), // 7 days in future
  revokedAt: null,
  maxUses: 1,
  useCount: 0,
});

describe('evaluateInviteToken', () => {
  it('(a) expired row returns EXPIRED', () => {
    const row = base();
    row.expiresAt = new Date(Date.now() - 1000); // 1 second in the past
    const now = new Date();
    expect(evaluateInviteToken(row, now)).toBe('EXPIRED');
  });

  it('(b) revokedAt non-null returns CONSUMED', () => {
    const row = base();
    row.revokedAt = new Date(Date.now() - 3_600_000); // revoked 1 hour ago
    const now = new Date();
    expect(evaluateInviteToken(row, now)).toBe('CONSUMED');
  });

  it('(c) maxUses non-null and useCount >= maxUses returns CONSUMED', () => {
    const row = base();
    row.maxUses = 1;
    row.useCount = 1; // already consumed
    const now = new Date();
    expect(evaluateInviteToken(row, now)).toBe('CONSUMED');
  });

  it('(d) maxUses null (unlimited) and any useCount returns OK', () => {
    const row = base();
    row.maxUses = null; // unlimited / multi-use
    row.useCount = 999; // many uses, doesn't matter
    const now = new Date();
    expect(evaluateInviteToken(row, now)).toBe('OK');
  });

  it('(e) valid unexpired single-use with useCount=0 returns OK', () => {
    const row = base(); // expiresAt=7d future, revokedAt=null, maxUses=1, useCount=0
    const now = new Date();
    expect(evaluateInviteToken(row, now)).toBe('OK');
  });
});
