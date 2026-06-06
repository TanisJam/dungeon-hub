import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampanaDetailView } from './campana-detail-view';
import type { CampaignDetail } from './types';

// CampanaDetailView now conditionally renders InviteAffordance and ArchiveAffordance
// ('use client'), which transitively import @/lib/supabase/client → @/lib/env → throws
// without env vars. Mock the client and navigation modules so these render tests stay
// env-agnostic.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/api', () => ({
  api: { post: vi.fn() },
  ApiError: class ApiError extends Error {},
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// SessionList renders a client component; stub it at the boundary so
// campana-detail-view tests don't pull in supabase/server or the full RSC tree.
vi.mock('@/components/campanas/sessions/session-list', () => ({
  SessionList: ({
    sessions,
    callerRole,
    activeParticipantCharIds,
  }: {
    sessions: unknown[];
    callerRole: string;
    activeParticipantCharIds: string[];
    campaignId: string;
    worldId: string;
  }) => (
    <div data-testid="session-list" data-caller-role={callerRole}>
      {sessions.length === 0 && <span>No hay sesiones aún</span>}
      {callerRole === 'gm' && <button aria-label="Nueva sesión">+</button>}
      {activeParticipantCharIds.map((id: string) => (
        <span key={id} data-testid="active-char">{id}</span>
      ))}
    </div>
  ),
}));

const baseDetail: CampaignDetail = {
  id: 'camp-1',
  name: 'Tres Lunas',
  gmUserId: 'gm-1',
  worldId: 'w-1',
  createdAt: '2026-01-01T00:00:00Z',
  memberRole: 'gm',
  status: 'active',
  callerRole: 'gm',
  playersCount: 3,
  sessionsCount: 7,
  nextSession: null,
  pendingFichas: 0,
  members: [
    { userId: 'u-gm', username: 'mau', role: 'gm', joinedAt: '2026-01-01T00:00:00Z' },
    { userId: 'u-p1', username: 'flor', role: 'player', joinedAt: '2026-01-02T00:00:00Z' },
  ],
};

const scheduledSession = {
  id: 's1',
  title: 'La sesión inicial',
  status: 'scheduled' as const,
  scheduledAt: null,
  levelMin: null,
  levelMax: null,
  maxPlayers: null,
  currentPlayers: 0,
  participants: [],
};

describe('CampanaDetailView', () => {
  it('WCD-METADATA-01: renders name; renders tagline when present; omits tagline when empty', () => {
    const { rerender } = render(
      <CampanaDetailView detail={{ ...baseDetail, tagline: 'Bajo el cielo del lago' }} sessions={[]} callerUserId="u-gm" worldId="w-1" callerCharacters={[]} />,
    );
    expect(screen.getByText('Tres Lunas')).toBeTruthy();
    expect(screen.getByText('Bajo el cielo del lago')).toBeTruthy();

    rerender(<CampanaDetailView detail={{ ...baseDetail, tagline: '' }} sessions={[]} callerUserId="u-gm" worldId="w-1" callerCharacters={[]} />);
    // Re-find name (still rendered); tagline element absent
    expect(screen.getByText('Tres Lunas')).toBeTruthy();
    expect(screen.queryByTestId('campana-tagline')).toBeNull();
  });

  it('WCD-MEMBERS-LIST-02: renders one row per member with username + role label', () => {
    render(<CampanaDetailView detail={baseDetail} sessions={[]} callerUserId="u-gm" worldId="w-1" callerCharacters={[]} />);
    expect(screen.getByText('mau')).toBeTruthy();
    expect(screen.getByText('flor')).toBeTruthy();
    expect(screen.getByText('DM')).toBeTruthy();
    expect(screen.getByText('Jugador')).toBeTruthy();
  });

  it('WCD-SESSIONS-LIST-03: empty sessions renders "No hay sesiones aún"', () => {
    render(<CampanaDetailView detail={baseDetail} sessions={[]} callerUserId="u-gm" worldId="w-1" callerCharacters={[]} />);
    expect(screen.getByText('No hay sesiones aún')).toBeTruthy();
  });

  it('WCD-SESSIONS-LIST-03: passes sessions down to SessionList', () => {
    render(
      <CampanaDetailView
        detail={baseDetail}
        sessions={[scheduledSession]}
        callerUserId="u-gm"
        worldId="w-1"
        callerCharacters={[]}
      />,
    );
    // The mock SessionList renders a data-testid="session-list" — it received sessions
    expect(screen.getByTestId('session-list')).toBeTruthy();
  });

  // REQ-DPPMB-CT-01: FAB gating
  it('REQ-DPPMB-CT-01: SessionList receives callerRole gm when detail.callerRole is gm', () => {
    render(
      <CampanaDetailView
        detail={{ ...baseDetail, callerRole: 'gm' }}
        sessions={[scheduledSession]}
        callerUserId="u-gm"
        worldId="w-1"
        callerCharacters={[]}
      />,
    );
    const list = screen.getByTestId('session-list');
    expect(list.getAttribute('data-caller-role')).toBe('gm');
    // The mock FAB is visible for gm
    expect(screen.getByRole('button', { name: 'Nueva sesión' })).toBeTruthy();
  });

  it('REQ-DPPMB-CT-01: SessionList receives callerRole player — no FAB rendered', () => {
    render(
      <CampanaDetailView
        detail={{ ...baseDetail, callerRole: 'player' }}
        sessions={[scheduledSession]}
        callerUserId="u-p1"
        worldId="w-1"
        callerCharacters={[]}
      />,
    );
    const list = screen.getByTestId('session-list');
    expect(list.getAttribute('data-caller-role')).toBe('player');
    expect(screen.queryByRole('button', { name: 'Nueva sesión' })).toBeNull();
  });

  // REQ-DPPMB-CT-01: active participant derivation
  it('REQ-DPPMB-CT-01: active participant charIds derived from sessions for current user', () => {
    render(
      <CampanaDetailView
        detail={{ ...baseDetail, callerRole: 'player' }}
        sessions={[
          {
            ...scheduledSession,
            status: 'active',
            participants: [
              { characterId: 'char-abc', userId: 'u-p1', joinedAt: '', leftAt: null },
            ],
          },
        ]}
        callerUserId="u-p1"
        worldId="w-1"
        callerCharacters={[]}
      />,
    );
    // mock renders data-testid="active-char" for each activeParticipantCharId
    expect(screen.getByTestId('active-char')).toBeTruthy();
    expect(screen.getByText('char-abc')).toBeTruthy();
  });
});
