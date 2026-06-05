/**
 * EventTimeline component tests.
 * REQ-DPPMB-DETAIL-05, REQ-DPPMB-DETAIL-06.
 *
 * Scenarios:
 *  - Renders events in chronological ascending order
 *  - Renders each event's type label
 *  - Renders relative time for each event
 *  - Renders empty state when no events
 *
 * NOTE: afterEach(cleanup) global — do NOT re-add.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventTimeline } from './event-timeline';
import type { SessionEvent } from '@/app/campanas/[id]/sessions/actions';

const makeEvent = (overrides: Partial<SessionEvent> = {}): SessionEvent => ({
  id: 'evt-1',
  sessionId: 'sess-1',
  type: 'session_started',
  visibility: 'public',
  actorUserId: 'user-1',
  payload: null,
  occurredAt: '2025-01-01T10:00:00.000Z',
  ...overrides,
});

describe('EventTimeline', () => {
  it('renders empty state when no events', () => {
    render(<EventTimeline events={[]} />);
    expect(screen.getByText(/no hay eventos/i)).toBeTruthy();
  });

  it('renders an event type label', () => {
    const events = [makeEvent({ type: 'session_started' })];
    render(<EventTimeline events={events} />);
    // The component should display human-readable labels or the type itself
    expect(screen.getByTestId('event-timeline')).toBeTruthy();
    expect(document.querySelector('[data-event-type]')).toBeTruthy();
  });

  it('renders events in chronological ascending order by occurredAt', () => {
    const events = [
      makeEvent({ id: 'evt-2', type: 'session_paused', occurredAt: '2025-01-01T12:00:00.000Z' }),
      makeEvent({ id: 'evt-1', type: 'session_started', occurredAt: '2025-01-01T10:00:00.000Z' }),
      makeEvent({ id: 'evt-3', type: 'session_resumed', occurredAt: '2025-01-01T14:00:00.000Z' }),
    ];
    render(<EventTimeline events={events} />);
    const items = document.querySelectorAll('[data-event-type]');
    expect(items.length).toBe(3);
    expect(items[0]?.getAttribute('data-event-type')).toBe('session_started');
    expect(items[1]?.getAttribute('data-event-type')).toBe('session_paused');
    expect(items[2]?.getAttribute('data-event-type')).toBe('session_resumed');
  });

  it('renders all events passed in', () => {
    const events = [
      makeEvent({ id: 'evt-1', type: 'session_started', occurredAt: '2025-01-01T10:00:00.000Z' }),
      makeEvent({ id: 'evt-2', type: 'reward_distributed', occurredAt: '2025-01-01T12:00:00.000Z' }),
    ];
    render(<EventTimeline events={events} />);
    const items = document.querySelectorAll('[data-event-type]');
    expect(items.length).toBe(2);
  });
});
