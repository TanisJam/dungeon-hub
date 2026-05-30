/**
 * Tests for pipeline event types — AttackEvent and CastEvent structural assertions.
 *
 * PHB p.194 — Attack Rolls: attack carries toHitTotal which is compared to defender AC.
 * PHB p.228 — Counterspell: reactions listen on CastEvent (not AttackEvent).
 *
 * REQ-ERB-TYPES-01: AttackEvent adds alongside CastEvent; CastEvent is unchanged.
 * Strict TDD — RED first (task 1.1 RED).
 */

import { describe, expect, it } from 'vitest';
import type { CastEvent, AttackEvent } from './events.js';
import type { EventKind } from '../types.js';

describe('AttackEvent', () => {
  it('is assignable with kind attacked, actionId, toHitTotal, attackerId, targetId (REQ-ERB-TYPES-01)', () => {
    // GIVEN a well-formed AttackEvent
    const ev: AttackEvent = {
      kind: 'attacked',
      actionId: 'atk-001',
      toHitTotal: 18,
      attackerId: 'fighter-1' as import('../types.js').EntityId,
      targetId: 'goblin-1' as import('../types.js').EntityId,
    };

    // THEN all fields are present
    expect(ev.kind).toBe('attacked');
    expect(ev.actionId).toBe('atk-001');
    expect(ev.toHitTotal).toBe(18);
    expect(ev.attackerId).toBe('fighter-1');
    expect(ev.targetId).toBe('goblin-1');
  });

  it('AttackEvent.kind discriminates from CastEvent.kind (REQ-ERB-TYPES-01)', () => {
    const attackEv: AttackEvent = {
      kind: 'attacked',
      actionId: 'atk-002',
      toHitTotal: 15,
      attackerId: 'rogue-1' as import('../types.js').EntityId,
      targetId: 'orc-1' as import('../types.js').EntityId,
    };
    const castEv: CastEvent = {
      kind: 'cast',
      actionId: 'cast-001',
      spellLevel: 2,
      caster: 'wizard-1' as import('../types.js').EntityId,
      targetDistance: 30,
    };

    expect(attackEv.kind).not.toBe(castEv.kind);
    expect(castEv.kind).toBe('cast');
    expect(attackEv.kind).toBe('attacked');
  });

  it("EventKind 'attacked' satisfies the EventKind union (REQ-ERB-TYPES-01)", () => {
    // Compile-time: 'attacked' is a valid EventKind (already in types.ts L128)
    const k: EventKind = 'attacked';
    expect(k).toBe('attacked');
  });
});

describe('CastEvent (REQ-ERB-TYPES-01 — CastEvent MUST NOT change)', () => {
  it('CastEvent retains all original fields unchanged', () => {
    // PHB p.228: CastEvent is the trigger for Counterspell — shape must not regress
    const ev: CastEvent = {
      kind: 'cast',
      actionId: 'cs-001',
      spellLevel: 3,
      caster: 'sorcerer-1' as import('../types.js').EntityId,
      targetDistance: 60,
    };
    expect(ev.kind).toBe('cast');
    expect(ev.spellLevel).toBe(3);
    expect(ev.targetDistance).toBe(60);
  });
});
