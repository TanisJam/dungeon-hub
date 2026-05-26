/**
 * Tests for validateCharacterTransition — character approval state machine.
 * Covers REQ-CAF-LEGAL-TRANSITIONS from sdd/character-approval-flow/spec (#833).
 */
import { describe, expect, it } from 'vitest';
import { validateCharacterTransition } from './state-machine.js';

describe('validateCharacterTransition — legal transitions', () => {
  it('owner publishes: draft → pending_approval', () => {
    expect(validateCharacterTransition('draft', 'pending_approval', 'owner')).toEqual({ ok: true });
  });

  it('owner self-cancels: pending_approval → draft', () => {
    expect(validateCharacterTransition('pending_approval', 'draft', 'owner')).toEqual({ ok: true });
  });

  it('gm rejects: pending_approval → draft', () => {
    expect(validateCharacterTransition('pending_approval', 'draft', 'gm')).toEqual({ ok: true });
  });

  it('gm approves: pending_approval → active', () => {
    expect(validateCharacterTransition('pending_approval', 'active', 'gm')).toEqual({ ok: true });
  });

  it('gm reverts: active → draft', () => {
    expect(validateCharacterTransition('active', 'draft', 'gm')).toEqual({ ok: true });
  });

  it('owner retires: active → retired', () => {
    expect(validateCharacterTransition('active', 'retired', 'owner')).toEqual({ ok: true });
  });

  it('gm retires: active → retired', () => {
    expect(validateCharacterTransition('active', 'retired', 'gm')).toEqual({ ok: true });
  });

  it('gm marks dead: active → dead', () => {
    expect(validateCharacterTransition('active', 'dead', 'gm')).toEqual({ ok: true });
  });
});

describe('validateCharacterTransition — illegal transitions', () => {
  it('draft → active (skipping approval) → ILLEGAL_TRANSITION', () => {
    const r = validateCharacterTransition('draft', 'active', 'gm');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({ code: 'ILLEGAL_TRANSITION', from: 'draft', to: 'active' });
  });

  it('retired → draft → ILLEGAL_TRANSITION (terminal state)', () => {
    const r = validateCharacterTransition('retired', 'draft', 'gm');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({ code: 'ILLEGAL_TRANSITION', from: 'retired', to: 'draft' });
  });

  it('dead → active → ILLEGAL_TRANSITION', () => {
    const r = validateCharacterTransition('dead', 'active', 'gm');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({ code: 'ILLEGAL_TRANSITION', from: 'dead', to: 'active' });
  });
});

describe('validateCharacterTransition — actor mismatch', () => {
  it('owner cannot approve their own char: pending_approval → active', () => {
    const r = validateCharacterTransition('pending_approval', 'active', 'owner');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({
      code: 'FORBIDDEN_FOR_ACTOR',
      from: 'pending_approval',
      to: 'active',
      requiredActor: 'gm',
    });
  });

  it('owner cannot mark dead: active → dead', () => {
    const r = validateCharacterTransition('active', 'dead', 'owner');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({
      code: 'FORBIDDEN_FOR_ACTOR',
      from: 'active',
      to: 'dead',
      requiredActor: 'gm',
    });
  });

  it('owner cannot revert: active → draft', () => {
    const r = validateCharacterTransition('active', 'draft', 'owner');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({
      code: 'FORBIDDEN_FOR_ACTOR',
      from: 'active',
      to: 'draft',
      requiredActor: 'gm',
    });
  });
});

describe('validateCharacterTransition — solo testing (owner-and-gm)', () => {
  it('owner-and-gm approves their own char: pending_approval → active (gm-permit applies)', () => {
    expect(validateCharacterTransition('pending_approval', 'active', 'owner-and-gm')).toEqual({
      ok: true,
    });
  });

  it('owner-and-gm can revert active → draft', () => {
    expect(validateCharacterTransition('active', 'draft', 'owner-and-gm')).toEqual({ ok: true });
  });

  it('owner-and-gm still subject to illegal-transition matrix: retired → draft', () => {
    const r = validateCharacterTransition('retired', 'draft', 'owner-and-gm');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toContainEqual({ code: 'ILLEGAL_TRANSITION', from: 'retired', to: 'draft' });
  });
});
