/**
 * Unit tests for guild_contributions domain functions.
 *
 * RED commit — written FIRST before implementation (strict TDD per CLAUDE.md §5).
 *
 * Design intent: FORK 4 (#1944) — guild_contributions from day 1, append-only,
 * visibility personal|guild|canonical, sealedStatus confirmed|debunked|null.
 * This arc encodes NO PHB rule — tests cite design decisions, not PHB pages.
 * REQ-CK-NOTE-06, REQ-CK-NOTE-07, REQ-CK-NOTE-08, REQ-CK-DOMAIN-01, DOMAIN-02, DOMAIN-03.
 */
import { describe, it, expect } from 'vitest';
import {
  validateContribution,
  canSeal,
  applySeal,
  isVisibleTo,
} from './validate.js';

// ── validateContribution ──────────────────────────────────────────────────────

describe('validateContribution — REQ-CK-NOTE-06 (FORK 4 #1944)', () => {
  const validInput = {
    contributionType: 'sighting',
    body: 'Spotted goblins near the river',
    visibility: 'personal' as const,
  };

  it('valid input with no ref → { ok: true }', () => {
    expect(validateContribution(validInput)).toEqual({ ok: true });
  });

  it('valid input with refEntityKind+refEntityId → { ok: true }', () => {
    const result = validateContribution({
      ...validInput,
      refEntityKind: 'bestiary',
      refEntityId: 'goblin',
    });
    expect(result).toEqual({ ok: true });
  });

  // (a) empty body → CONTRIBUTION_BODY_REQUIRED
  it('empty body → { ok: false, issues: [CONTRIBUTION_BODY_REQUIRED] }', () => {
    const result = validateContribution({ ...validInput, body: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CONTRIBUTION_BODY_REQUIRED' }));
    }
  });

  it('whitespace-only body → { ok: false, issues: [CONTRIBUTION_BODY_REQUIRED] }', () => {
    const result = validateContribution({ ...validInput, body: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({ code: 'CONTRIBUTION_BODY_REQUIRED' }));
    }
  });

  // (b) invalid contributionType → CONTRIBUTION_TYPE_INVALID with got/expected
  it('invalid contributionType → { ok: false, issues: [CONTRIBUTION_TYPE_INVALID] }', () => {
    const result = validateContribution({ ...validInput, contributionType: 'invalid-type' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'CONTRIBUTION_TYPE_INVALID', got: 'invalid-type' }),
      );
    }
  });

  // (c) invalid visibility → CONTRIBUTION_VISIBILITY_INVALID with got/expected
  it('invalid visibility → { ok: false, issues: [CONTRIBUTION_VISIBILITY_INVALID] }', () => {
    const result = validateContribution({ ...validInput, visibility: 'secret' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ code: 'CONTRIBUTION_VISIBILITY_INVALID', got: 'secret' }),
      );
    }
  });

  // (e) refEntityKind present without refEntityId → issue
  it('refEntityKind present without refEntityId → validation issue', () => {
    const result = validateContribution({
      ...validInput,
      refEntityKind: 'bestiary',
      refEntityId: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  // refEntityId without refEntityKind is also invalid
  it('refEntityId present without refEntityKind → validation issue', () => {
    const result = validateContribution({
      ...validInput,
      refEntityKind: null,
      refEntityId: 'goblin',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  // all valid visibility values
  it.each(['personal', 'guild', 'canonical'] as const)('visibility=%s is valid', (vis) => {
    expect(validateContribution({ ...validInput, visibility: vis })).toEqual({ ok: true });
  });

  // all seed contributionTypes
  it.each(['sighting', 'rumor', 'nota', 'mapa', 'encuentro', 'otro'])('contributionType=%s is valid', (type) => {
    expect(validateContribution({ ...validInput, contributionType: type })).toEqual({ ok: true });
  });
});

// ── canSeal ───────────────────────────────────────────────────────────────────

describe('canSeal — REQ-CK-NOTE-07 (FORK 4 #1944, world-GM only seals)', () => {
  // Design: canSeal returns boolean (pure function)
  it("canSeal('gm') → true", () => {
    expect(canSeal('gm')).toBe(true);
  });

  it("canSeal('player') → false", () => {
    expect(canSeal('player')).toBe(false);
  });
});

// ── applySeal ─────────────────────────────────────────────────────────────────

describe('applySeal — REQ-CK-NOTE-07 (pure function, no mutation, FORK 4 #1944)', () => {
  const baseContribution = {
    id: 'c1',
    body: 'Test note',
    authorUserId: 'user1',
    contributionType: 'sighting',
    visibility: 'guild' as const,
    sealedStatus: null as 'confirmed' | 'debunked' | null,
    sealedBy: null as string | null,
    sealedAt: null as Date | null,
  };

  it('returns a NEW object with updated sealedStatus, sealedBy, sealedAt', () => {
    const sealedAt = new Date('2026-06-05T12:00:00Z');
    const result = applySeal(baseContribution, 'confirmed', 'gm-user-id', sealedAt);
    expect(result.sealedStatus).toBe('confirmed');
    expect(result.sealedBy).toBe('gm-user-id');
    expect(result.sealedAt).toBe(sealedAt);
  });

  it('does NOT mutate the input object (pure functional)', () => {
    const sealedAt = new Date();
    const input = { ...baseContribution };
    applySeal(input, 'debunked', 'gm-user-id', sealedAt);
    // Original must be untouched
    expect(input.sealedStatus).toBeNull();
    expect(input.sealedBy).toBeNull();
  });

  it('returns object that is NOT the same reference as input', () => {
    const sealedAt = new Date();
    const result = applySeal(baseContribution, 'confirmed', 'gm-user-id', sealedAt);
    expect(result).not.toBe(baseContribution);
  });

  it('preserves other fields on the returned view', () => {
    const sealedAt = new Date();
    const result = applySeal(baseContribution, 'debunked', 'gm-user-id', sealedAt);
    expect(result.id).toBe('c1');
    expect(result.body).toBe('Test note');
    expect(result.authorUserId).toBe('user1');
    expect(result.visibility).toBe('guild');
  });
});

// ── isVisibleTo ───────────────────────────────────────────────────────────────

describe('isVisibleTo — REQ-CK-NOTE-08 (FORK 4 #1944, visibility semantics)', () => {
  const author = { userId: 'player-1', role: 'player' as const };
  const otherPlayer = { userId: 'player-2', role: 'player' as const };
  const gm = { userId: 'gm-user', role: 'gm' as const };

  const personalContrib = {
    visibility: 'personal' as const,
    authorUserId: 'player-1',
    sealedStatus: null as 'confirmed' | 'debunked' | null,
  };
  const guildContrib = {
    visibility: 'guild' as const,
    authorUserId: 'player-1',
    sealedStatus: null as 'confirmed' | 'debunked' | null,
  };
  const canonicalContrib = {
    visibility: 'canonical' as const,
    authorUserId: 'player-1',
    sealedStatus: 'confirmed' as const,
  };

  // (a) personal + author → true
  it('personal + author → true', () => {
    expect(isVisibleTo(personalContrib, author)).toBe(true);
  });

  // (b) personal + non-author player → false
  it('personal + non-author player → false', () => {
    expect(isVisibleTo(personalContrib, otherPlayer)).toBe(false);
  });

  // (c) personal + gm → true (GM sees everything)
  it('personal + gm → true', () => {
    expect(isVisibleTo(personalContrib, gm)).toBe(true);
  });

  // (d) guild + any world member → true
  it('guild + author player → true', () => {
    expect(isVisibleTo(guildContrib, author)).toBe(true);
  });
  it('guild + other player → true', () => {
    expect(isVisibleTo(guildContrib, otherPlayer)).toBe(true);
  });
  it('guild + gm → true', () => {
    expect(isVisibleTo(guildContrib, gm)).toBe(true);
  });

  // (e) canonical + any member → true
  it('canonical + player → true', () => {
    expect(isVisibleTo(canonicalContrib, author)).toBe(true);
  });
  it('canonical + other player → true', () => {
    expect(isVisibleTo(canonicalContrib, otherPlayer)).toBe(true);
  });
  it('canonical + gm → true', () => {
    expect(isVisibleTo(canonicalContrib, gm)).toBe(true);
  });
});
