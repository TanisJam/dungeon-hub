import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampanaDetailView } from './campana-detail-view';
import type { CampaignDetail } from './types';

const baseDetail: CampaignDetail = {
  id: 'camp-1',
  name: 'Tres Lunas',
  gmUserId: 'gm-1',
  worldId: 'w-1',
  createdAt: '2026-01-01T00:00:00Z',
  memberRole: 'gm',
  playersCount: 3,
  sessionsCount: 7,
  nextSession: null,
  pendingFichas: 0,
  members: [
    { userId: 'u-gm', username: 'mau', role: 'gm', joinedAt: '2026-01-01T00:00:00Z' },
    { userId: 'u-p1', username: 'flor', role: 'player', joinedAt: '2026-01-02T00:00:00Z' },
  ],
};

describe('CampanaDetailView', () => {
  it('WCD-METADATA-01: renders name; renders tagline when present; omits tagline when empty', () => {
    const { rerender } = render(
      <CampanaDetailView detail={{ ...baseDetail, tagline: 'Bajo el cielo del lago' }} sessions={[]} />,
    );
    expect(screen.getByText('Tres Lunas')).toBeTruthy();
    expect(screen.getByText('Bajo el cielo del lago')).toBeTruthy();

    rerender(<CampanaDetailView detail={{ ...baseDetail, tagline: '' }} sessions={[]} />);
    // Re-find name (still rendered); tagline element absent
    expect(screen.getByText('Tres Lunas')).toBeTruthy();
    expect(screen.queryByTestId('campana-tagline')).toBeNull();
  });

  it('WCD-MEMBERS-LIST-02: renders one row per member with username + role label', () => {
    render(<CampanaDetailView detail={baseDetail} sessions={[]} />);
    expect(screen.getByText('mau')).toBeTruthy();
    expect(screen.getByText('flor')).toBeTruthy();
    expect(screen.getByText('DM')).toBeTruthy();
    expect(screen.getByText('Jugador')).toBeTruthy();
  });

  it('WCD-SESSIONS-LIST-03: empty sessions renders "No hay sesiones aún"', () => {
    render(<CampanaDetailView detail={baseDetail} sessions={[]} />);
    expect(screen.getByText('No hay sesiones aún')).toBeTruthy();
  });

  it('WCD-SESSIONS-LIST-03: renders 3 session rows when provided', () => {
    render(
      <CampanaDetailView
        detail={baseDetail}
        sessions={[
          { id: 's1', title: 'La sesión inicial', status: 'completed', scheduledAt: null },
          { id: 's2', title: 'Segunda noche', status: 'scheduled', scheduledAt: '2026-06-01T21:30:00Z' },
          { id: 's3', title: 'Sesión cancelada', status: 'cancelled', scheduledAt: null },
        ]}
      />,
    );
    expect(screen.getByText('La sesión inicial')).toBeTruthy();
    expect(screen.getByText('Segunda noche')).toBeTruthy();
    expect(screen.getByText('Sesión cancelada')).toBeTruthy();
  });
});
