import { describe, expect, it } from 'vitest';
import { assertWorldGm } from './assert-gm.js';
import type { WorldMembership } from './assert-gm.js';

// REQ-WF-DOMAIN-ASSERT-WORLD-GM
// Pure validator — no IO, no DB. Caller (use-case) loads memberships and passes them in.

describe('assertWorldGm — gm role membership', () => {
  it('WG-1: user with role=gm in target world → ok: true', () => {
    const memberships: WorldMembership[] = [
      { worldId: 'W1', userId: 'U1', role: 'gm' },
    ];
    expect(assertWorldGm(memberships, 'W1', 'U1')).toEqual({ ok: true });
  });

  it('WG-2: gm in a DIFFERENT world does not grant access to the target world', () => {
    // World-scoped check: being gm of W2 does not make you gm of W1
    const memberships: WorldMembership[] = [
      { worldId: 'W2', userId: 'U1', role: 'gm' },
    ];
    expect(assertWorldGm(memberships, 'W1', 'U1')).toEqual({
      ok: false,
      issues: [{ code: 'WORLD_GM_REQUIRED', worldId: 'W1', userId: 'U1' }],
    });
  });

  it('WG-3: user is both player in W1 and gm in W2, asks about W1 → ok: false', () => {
    const memberships: WorldMembership[] = [
      { worldId: 'W1', userId: 'U1', role: 'player' },
      { worldId: 'W2', userId: 'U1', role: 'gm' },
    ];
    expect(assertWorldGm(memberships, 'W1', 'U1')).toEqual({
      ok: false,
      issues: [{ code: 'WORLD_GM_REQUIRED', worldId: 'W1', userId: 'U1' }],
    });
  });
});

describe('assertWorldGm — player role only', () => {
  it('WG-4: user with role=player in target world → ok: false, WORLD_GM_REQUIRED', () => {
    const memberships: WorldMembership[] = [
      { worldId: 'W1', userId: 'U1', role: 'player' },
    ];
    expect(assertWorldGm(memberships, 'W1', 'U1')).toEqual({
      ok: false,
      issues: [{ code: 'WORLD_GM_REQUIRED', worldId: 'W1', userId: 'U1' }],
    });
  });
});

describe('assertWorldGm — no membership', () => {
  it('WG-5: empty membership array → ok: false, WORLD_GM_REQUIRED', () => {
    expect(assertWorldGm([], 'W1', 'U1')).toEqual({
      ok: false,
      issues: [{ code: 'WORLD_GM_REQUIRED', worldId: 'W1', userId: 'U1' }],
    });
  });
});
