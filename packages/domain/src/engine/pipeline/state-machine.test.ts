/**
 * Pipeline state-machine tests.
 *
 * // REQ-PIPELINE-01: PHB action sequence; Counterspell reaction window (PHB 228).
 * PHB 228: "You attempt to interrupt a creature in the process of casting a spell.
 *  If the creature is casting a spell of 3rd level or lower, its spell fails and
 *  has no effect." — reaction fires at CAST_ANNOUNCED (slot spent, effects not applied).
 */
import { describe, it, expect } from 'vitest';
import { advancePhase } from './state-machine.js';
import type { ActionInFlight } from './phases.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function attack(phase: ActionInFlight['phase']): ActionInFlight {
  return { id: 'atk-1', type: 'attack', phase };
}

function spell(phase: ActionInFlight['phase'], spellLevel = 2): ActionInFlight {
  return { id: 'spell-1', type: 'spell', phase, spellLevel };
}

/** Asserts ok:true and returns the action (narrows the discriminated union for tests). */
function step(action: ActionInFlight, signal: Parameters<typeof advancePhase>[1]): ActionInFlight {
  const result = advancePhase(action, signal);
  if (!result.ok) throw new Error(`Expected ok:true but got ok:false (phase=${action.phase}, signal=${signal})`);
  return result.action;
}

// ── attack pipeline ───────────────────────────────────────────────────────────

describe('advancePhase — attack pipeline', () => {
  it('progresses DECLARED → TO_HIT → ON_HIT → DAMAGE → ON_DAMAGE_APPLIED → RESOLVED in sequence', () => {
    let action = attack('DECLARED');

    action = step(action, 'advance');
    expect(action.phase).toBe('TO_HIT');

    action = step(action, 'advance');
    expect(action.phase).toBe('ON_HIT');

    action = step(action, 'advance');
    expect(action.phase).toBe('DAMAGE');

    action = step(action, 'advance');
    expect(action.phase).toBe('ON_DAMAGE_APPLIED');

    action = step(action, 'advance');
    expect(action.phase).toBe('RESOLVED');
  });

  it('returns ok:true for each legal transition', () => {
    const result = advancePhase(attack('DECLARED'), 'advance');
    expect(result.ok).toBe(true);
  });
});

// ── spell pipeline ────────────────────────────────────────────────────────────

describe('advancePhase — spell pipeline', () => {
  it('progresses DECLARED → CAST_ANNOUNCED → RESOLVING → RESOLVED with no reaction', () => {
    let action = spell('DECLARED');

    action = step(action, 'announce');
    expect(action.phase).toBe('CAST_ANNOUNCED');

    action = step(action, 'advance');
    expect(action.phase).toBe('RESOLVING');

    action = step(action, 'advance');
    expect(action.phase).toBe('RESOLVED');
  });

  it('CAST_ANNOUNCED → reaction fires → INTERRUPTED → counter succeeds → CANCELLED (terminal)', () => {
    let action = spell('CAST_ANNOUNCED');

    // Reaction fires at CAST_ANNOUNCED
    action = step(action, 'reaction');
    expect(action.phase).toBe('INTERRUPTED');

    // Counter succeeds — spell cancelled
    const result = advancePhase(action, 'counter-success');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.action.phase).toBe('CANCELLED');
  });

  it('CAST_ANNOUNCED → reaction fires → INTERRUPTED → counter fails → RESOLVING', () => {
    let action = spell('CAST_ANNOUNCED');

    action = step(action, 'reaction');
    expect(action.phase).toBe('INTERRUPTED');

    const result = advancePhase(action, 'counter-fail');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.action.phase).toBe('RESOLVING');
  });
});

// ── cancel signal ─────────────────────────────────────────────────────────────

describe('advancePhase — cancel signal', () => {
  it('DECLARED + cancel → CANCELLED (terminal)', () => {
    const result = advancePhase(attack('DECLARED'), 'cancel');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.action.phase).toBe('CANCELLED');
  });

  it('CANCELLED is terminal — subsequent advance returns ok:false', () => {
    const cancelled = attack('CANCELLED');
    const result = advancePhase(cancelled, 'advance');
    expect(result.ok).toBe(false);
    expect('issues' in result).toBe(true);
  });
});

// ── terminal states ───────────────────────────────────────────────────────────

describe('advancePhase — terminal states', () => {
  it('RESOLVED is terminal — subsequent advance returns ok:false', () => {
    const resolved = attack('RESOLVED');
    const result = advancePhase(resolved, 'advance');
    expect(result.ok).toBe(false);
  });
});
