/**
 * SessionDetailView component tests.
 * REQ-DPPMB-DETAIL-03, REQ-DPPMB-DETAIL-04, REQ-DPPMB-DETAIL-06.
 *
 * Scenarios:
 *  - Renders session title in header
 *  - Renders status pill with correct label
 *  - Renders scheduledAt date when set
 *  - Renders participant chip with enriched name + level
 *  - GM sees left participants with "Salió" indicator
 *  - Non-GM does NOT see left participants
 *  - Passes events to EventTimeline
 *  - DmControls slot rendered when provided (B5 wires actual controls)
 *  - No DmControls slot rendered when not provided
 *
 * NOTE: afterEach(cleanup) global — do NOT re-add.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionDetailView } from './session-detail-view';
import type { SessionDetail, SessionEvent } from '@/app/campanas/[id]/sessions/actions';

// ── Mock next/link ──────────────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// ── Mock EventTimeline to isolate rendering concerns ─────────────────────────
vi.mock('./event-timeline', () => ({
  EventTimeline: ({ events }: { events: SessionEvent[] }) => (
    <div data-testid="event-timeline-mock">{events.length} events</div>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseDetail: SessionDetail = {
  id: 'sess-1',
  campaignId: 'camp-1',
  title: 'La Gran Batalla',
  description: null,
  dmNotes: null,
  status: 'active',
  scheduledAt: '2025-06-15T20:00:00.000Z',
  levelMin: 3,
  levelMax: 5,
  maxPlayers: 4,
  locationHexId: null,
  gmUserId: 'gm-user-1',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  participants: [
    {
      characterId: 'char-1',
      userId: 'user-1',
      joinedAt: '2025-01-01T10:00:00.000Z',
      leftAt: null,
      name: 'Aelar Windrunner',
      lineage: 'Elfo',
      level: 4,
    },
    {
      characterId: 'char-2',
      userId: 'user-2',
      joinedAt: '2025-01-01T10:00:00.000Z',
      leftAt: '2025-01-01T11:00:00.000Z',
      name: 'Bruenor Battlehammer',
      lineage: 'Enano',
      level: 5,
    },
  ],
};

const baseEvents: SessionEvent[] = [
  {
    id: 'evt-1',
    sessionId: 'sess-1',
    eventType: 'session_started',
    visibility: 'public',
    actorUserId: 'gm-user-1',
    payload: null,
    occurredAt: '2025-01-01T10:05:00.000Z',
  },
];

function renderDetailView({
  detail = baseDetail,
  events = baseEvents,
  accessLevel = 'participant' as 'gm' | 'participant' | 'campaign-member',
  campaignId = 'camp-1',
  gmName = 'Dungeon Master',
  dmControlsSlot = undefined as React.ReactNode,
} = {}) {
  return render(
    <SessionDetailView
      detail={detail}
      events={events}
      accessLevel={accessLevel}
      campaignId={campaignId}
      gmName={gmName}
      dmControlsSlot={dmControlsSlot}
    />,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SessionDetailView', () => {
  // --- Header ---

  it('renders session title in header', () => {
    renderDetailView();
    expect(screen.getByRole('heading', { name: /la gran batalla/i })).toBeTruthy();
  });

  it('renders "En curso" status pill for active status', () => {
    renderDetailView({ detail: { ...baseDetail, status: 'active' } });
    expect(screen.getByText('En curso')).toBeTruthy();
  });

  it('renders "Programada" status pill for scheduled status', () => {
    renderDetailView({ detail: { ...baseDetail, status: 'scheduled' } });
    expect(screen.getByText('Programada')).toBeTruthy();
  });

  it('renders "Jugada" status pill for completed status', () => {
    renderDetailView({ detail: { ...baseDetail, status: 'completed' } });
    expect(screen.getByText('Jugada')).toBeTruthy();
  });

  it('renders scheduledAt date when set', () => {
    renderDetailView();
    // Should render a formatted date string (not necessarily exact format)
    const dateEl = document.querySelector('[data-testid="session-scheduled-at"]');
    expect(dateEl).toBeTruthy();
  });

  it('renders GM name in header', () => {
    renderDetailView({ gmName: 'Thorin el DM' });
    expect(screen.getByText(/thorin el dm/i)).toBeTruthy();
  });

  it('derives player count from ACTIVE participants (verify BUG-1: no currentPlayers on detail)', () => {
    // baseDetail has maxPlayers 4, participants = 1 active + 1 left → 1/4, NOT undefined/4.
    renderDetailView();
    expect(screen.getByText('1/4 jugadores')).toBeTruthy();
  });

  // --- Participants ---

  it('renders active participant chip with enriched name', () => {
    renderDetailView({ accessLevel: 'gm' });
    expect(screen.getByText('Aelar Windrunner')).toBeTruthy();
  });

  it('renders participant level in chip', () => {
    renderDetailView({ accessLevel: 'participant' });
    // Active participant (Aelar Windrunner) level 4
    expect(screen.getByText(/nv.*4/i)).toBeTruthy();
  });

  it('GM sees left participant with "Salió" indicator', () => {
    renderDetailView({ accessLevel: 'gm' });
    expect(screen.getByText('Bruenor Battlehammer')).toBeTruthy();
    expect(screen.getByText(/salió/i)).toBeTruthy();
  });

  it('non-GM does NOT see left participants', () => {
    renderDetailView({ accessLevel: 'participant' });
    expect(screen.queryByText('Bruenor Battlehammer')).toBeNull();
    expect(screen.queryByText(/salió/i)).toBeNull();
  });

  // --- Timeline ---

  it('renders EventTimeline with the events prop', () => {
    renderDetailView();
    expect(screen.getByTestId('event-timeline-mock')).toBeTruthy();
    expect(screen.getByText(/1 events/)).toBeTruthy();
  });

  // --- DmControls slot (B5 contract) ---

  it('renders DmControls slot when provided', () => {
    renderDetailView({
      dmControlsSlot: <div data-testid="dm-controls-stub">DM Controls Here</div>,
    });
    expect(screen.getByTestId('dm-controls-stub')).toBeTruthy();
  });

  it('does NOT render a DmControls container when slot is not provided', () => {
    renderDetailView({ dmControlsSlot: undefined });
    expect(screen.queryByTestId('dm-controls-stub')).toBeNull();
  });
});
