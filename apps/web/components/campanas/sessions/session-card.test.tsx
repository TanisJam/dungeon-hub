import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionCard } from './session-card';
import type { CampanaSessionRow } from '@/components/campanas/campana-detail-view';

// REQ-DPPMB-CT-01, REQ-DPPMB-LIST-02, REQ-DPPMB-LIST-05, REQ-DPPMB-LIST-06, REQ-DPPMB-LIST-07

// Stub next/link so tests don't need a router context
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const baseSession: CampanaSessionRow = {
  id: 's-1',
  title: 'La primera sesión',
  status: 'scheduled',
  scheduledAt: null,
  levelMin: null,
  levelMax: null,
  maxPlayers: null,
  currentPlayers: 0,
  participants: [],
};

describe('SessionCard', () => {
  it('REQ-DPPMB-LIST-02: renders title', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={baseSession}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('La primera sesión')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: renders "Programada" pill for scheduled status', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'scheduled' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('Programada')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: renders "En curso" pill for active status', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'active' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('En curso')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: renders "Pausada" pill for paused status', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'paused' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('Pausada')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: renders "Jugada" pill for completed status', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'completed' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('Jugada')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: renders "Cancelada" pill for cancelled status', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'cancelled' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('Cancelada')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: renders slots "n/max" when maxPlayers is set', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, maxPlayers: 5, currentPlayers: 2 }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('2/5')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: omits slots when maxPlayers is null', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, maxPlayers: null, currentPlayers: 1 }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.queryByText(/\d+\/null/)).toBeNull();
  });

  it('REQ-DPPMB-LIST-02: renders level range "Nv 3–5" when both set', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, levelMin: 3, levelMax: 5 }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('Nv 3–5')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-02: omits level range when both null', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, levelMin: null, levelMax: null }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.queryByText(/Nv/)).toBeNull();
  });

  it('REQ-DPPMB-LIST-09: renders "Ver" link pointing to the session detail route', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={baseSession}
        activeParticipantCharIds={[]}
      />,
    );
    const link = screen.getByRole('link', { name: 'Ver' });
    expect(link.getAttribute('href')).toBe('/campanas/c-1/sessions/s-1');
  });

  it('REQ-DPPMB-LIST-05: player not in session sees "Unirme" on scheduled session', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'scheduled' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('Unirme')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-05: player not in session sees "Unirme" on active session', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'active' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.getByText('Unirme')).toBeTruthy();
  });

  it('REQ-DPPMB-LIST-06: player in session sees "En sesión" chip and "Salir" button', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{
          ...baseSession,
          status: 'active',
          participants: [{ characterId: 'char-1', userId: 'u-1', joinedAt: '', leftAt: null }],
        }}
        activeParticipantCharIds={['char-1']}
      />,
    );
    expect(screen.getByText('En sesión')).toBeTruthy();
    expect(screen.getByText('Salir')).toBeTruthy();
    expect(screen.queryByText('Unirme')).toBeNull();
  });

  it('REQ-DPPMB-LIST-07: terminal status "completed" shows no join/leave actions', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'completed' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.queryByText('Unirme')).toBeNull();
    expect(screen.queryByText('Salir')).toBeNull();
  });

  it('REQ-DPPMB-LIST-07: terminal status "cancelled" shows no join/leave actions', () => {
    render(
      <SessionCard
        campaignId="c-1"
        session={{ ...baseSession, status: 'cancelled' }}
        activeParticipantCharIds={[]}
      />,
    );
    expect(screen.queryByText('Unirme')).toBeNull();
    expect(screen.queryByText('Salir')).toBeNull();
  });
});
