import type { SessionStatus } from './load-session.js';

/**
 * Transiciones válidas de una sesión.
 *
 *   scheduled → active (start)
 *   scheduled → cancelled (cancel)
 *   active    ⇄ paused (pause/resume)
 *   active    → completed (complete)
 *   active    → cancelled (cancel)
 *   paused    → completed (complete)
 *   paused    → cancelled (cancel)
 *
 * Estados terminales: completed, cancelled. No salen de ahí.
 */
const ALLOWED: Record<SessionStatus, SessionStatus[]> = {
  scheduled: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export type StateAction = 'start' | 'pause' | 'resume' | 'complete' | 'cancel';

const ACTION_TO_TARGET: Record<StateAction, SessionStatus> = {
  start: 'active',
  pause: 'paused',
  resume: 'active',
  complete: 'completed',
  cancel: 'cancelled',
};

export interface InvalidTransitionIssue {
  code: 'INVALID_STATE_TRANSITION';
  from: SessionStatus;
  to: SessionStatus;
  action: StateAction;
}

export function applyTransition(
  current: SessionStatus,
  action: StateAction,
):
  | { ok: true; next: SessionStatus }
  | { ok: false; issue: InvalidTransitionIssue } {
  const target = ACTION_TO_TARGET[action];
  if (!ALLOWED[current].includes(target)) {
    return { ok: false, issue: { code: 'INVALID_STATE_TRANSITION', from: current, to: target, action } };
  }
  return { ok: true, next: target };
}
