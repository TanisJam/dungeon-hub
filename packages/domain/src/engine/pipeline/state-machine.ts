/**
 * Pipeline state machine — pure action phase transitions.
 *
 * advancePhase(action, signal) → new ActionInFlight (NEVER mutates input).
 *
 * Design ref: sdd/resolution-engine/design — RESOLVED OPEN ITEM 3.
 *
 * State machine (design diagram):
 *   Attack:  DECLARED → TO_HIT → ON_HIT → DAMAGE → ON_DAMAGE_APPLIED → RESOLVED
 *   Spell:   DECLARED --announce--> CAST_ANNOUNCED --advance--> RESOLVING --advance--> RESOLVED
 *                                       |
 *                                 reaction window
 *                                       |
 *                                  INTERRUPTED --counter-success--> CANCELLED (terminal)
 *                                       |
 *                                  counter-fail/declined --> RESOLVING
 *
 * Terminal states: RESOLVED, CANCELLED. Any signal on a terminal state returns ok:false.
 *
 * // REQ-PIPELINE-01: PHB action sequence; Counterspell reaction window (PHB 228).
 */
import type { ActionInFlight, AttackPhase, SpellPhase } from './phases.js';

// ── Signals ───────────────────────────────────────────────────────────────────

/**
 * Signals that drive state transitions.
 *  - 'advance': step to the next phase in normal progression
 *  - 'announce': spell-specific — DECLARED → CAST_ANNOUNCED
 *  - 'reaction': a reaction fired at CAST_ANNOUNCED → INTERRUPTED
 *  - 'counter-success': reaction resolved — spell cancelled
 *  - 'counter-fail': reaction resolved — spell continues
 *  - 'cancel': force-cancel at any non-terminal phase → CANCELLED
 */
export type PipelineSignal =
  | 'advance'
  | 'announce'
  | 'reaction'
  | 'counter-success'
  | 'counter-fail'
  | 'cancel';

// ── Result type ───────────────────────────────────────────────────────────────

export type AdvanceResult =
  | { ok: true; action: ActionInFlight }
  | { ok: false; issues: [{ code: 'TERMINAL_STATE'; phase: string }] };

// ── Transition tables ─────────────────────────────────────────────────────────

// Attack: normal progression (only 'advance' signal moves forward)
const ATTACK_ADVANCE: ReadonlyMap<AttackPhase, AttackPhase> = new Map([
  ['DECLARED', 'TO_HIT'],
  ['TO_HIT', 'ON_HIT'],
  ['ON_HIT', 'DAMAGE'],
  ['DAMAGE', 'ON_DAMAGE_APPLIED'],
  ['ON_DAMAGE_APPLIED', 'RESOLVED'],
]);

// Spell: normal progression (signal-specific)
type SpellTransition = { signal: PipelineSignal; from: SpellPhase; to: SpellPhase };
const SPELL_TRANSITIONS: ReadonlyArray<SpellTransition> = [
  { signal: 'announce', from: 'DECLARED', to: 'CAST_ANNOUNCED' },
  { signal: 'advance', from: 'DECLARED', to: 'CAST_ANNOUNCED' }, // alias: advance also triggers announce
  { signal: 'advance', from: 'CAST_ANNOUNCED', to: 'RESOLVING' },
  { signal: 'reaction', from: 'CAST_ANNOUNCED', to: 'INTERRUPTED' },
  { signal: 'counter-success', from: 'INTERRUPTED', to: 'CANCELLED' },
  { signal: 'counter-fail', from: 'INTERRUPTED', to: 'RESOLVING' },
  { signal: 'advance', from: 'RESOLVING', to: 'RESOLVED' },
];

// Terminal phases that reject all further transitions
const TERMINAL_PHASES = new Set<string>(['RESOLVED', 'CANCELLED']);

// ── advancePhase ──────────────────────────────────────────────────────────────

/**
 * Advances an ActionInFlight by one step according to the given signal.
 *
 * Pure — returns a NEW ActionInFlight, never mutates the input.
 * Terminal states (RESOLVED, CANCELLED) reject further transitions.
 */
export function advancePhase(action: ActionInFlight, signal: PipelineSignal): AdvanceResult {
  // Terminal state guard — reject any transition
  if (TERMINAL_PHASES.has(action.phase)) {
    return {
      ok: false,
      issues: [{ code: 'TERMINAL_STATE', phase: action.phase }],
    };
  }

  // cancel signal — valid from any non-terminal phase
  if (signal === 'cancel') {
    return {
      ok: true,
      action: { ...action, phase: 'CANCELLED' },
    };
  }

  if (action.type === 'attack') {
    // Attack only uses 'advance'
    const nextPhase = ATTACK_ADVANCE.get(action.phase as AttackPhase);
    if (nextPhase === undefined) {
      return {
        ok: false,
        issues: [{ code: 'TERMINAL_STATE', phase: action.phase }],
      };
    }
    return { ok: true, action: { ...action, phase: nextPhase } };
  }

  // Spell pipeline — look up in transition table
  const transition = SPELL_TRANSITIONS.find(
    (t) => t.signal === signal && t.from === action.phase,
  );

  if (transition === undefined) {
    return {
      ok: false,
      issues: [{ code: 'TERMINAL_STATE', phase: action.phase }],
    };
  }

  return { ok: true, action: { ...action, phase: transition.to } };
}
