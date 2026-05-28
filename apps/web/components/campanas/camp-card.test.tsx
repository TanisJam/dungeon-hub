import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { V3CampCard } from './camp-card';
import type { CampaignSummary } from './types';

const baseCampaign: CampaignSummary = {
  id: 'camp-1',
  name: 'Tres Lunas',
  gmUserId: 'gm-1',
  worldId: 'world-1',
  createdAt: '2026-01-01T00:00:00Z',
  memberRole: 'player',
  playersCount: 5,
  sessionsCount: 4,
  nextSession: '2026-06-01T21:30:00Z',
  pendingFichas: null,
};

describe('V3CampCard', () => {
  it('T1 WCL-CARD-PILLS-02: DM variant renders full meta-row (jugadores + sesiones + Próx. + fichas pend.)', () => {
    render(
      <V3CampCard
        campaign={{
          ...baseCampaign,
          memberRole: 'gm',
          playersCount: 5,
          sessionsCount: 4,
          pendingFichas: 3,
        }}
      />,
    );
    expect(screen.getByText('5 jugadores')).toBeTruthy();
    expect(screen.getByText('4 sesiones')).toBeTruthy();
    expect(screen.getByText(/^Próx\./)).toBeTruthy();
    expect(screen.getByText('3 fichas pend.')).toBeTruthy();
  });

  it('T2 WCL-SESSIONS-PLURAL-03: sessionsCount=1 renders "1 sesión"; sessionsCount=0 hides pill', () => {
    const { rerender } = render(<V3CampCard campaign={{ ...baseCampaign, sessionsCount: 1 }} />);
    expect(screen.getByText('1 sesión')).toBeTruthy();

    rerender(<V3CampCard campaign={{ ...baseCampaign, sessionsCount: 0 }} />);
    expect(screen.queryByText(/sesion/i)).toBeNull();
  });

  it('T3 WCL-NEXT-SESSION-COND-04: nextSession=null hides Próx. pill', () => {
    render(<V3CampCard campaign={{ ...baseCampaign, nextSession: null }} />);
    expect(screen.queryByText(/^Próx\./)).toBeNull();
  });

  it('T4 WCL-CSS-SCOPED-05: DM card root has both campanas-camp-card and campanas-camp-card-dm', () => {
    const { container } = render(
      <V3CampCard campaign={{ ...baseCampaign, memberRole: 'gm' }} />,
    );
    const root = container.querySelector('.campanas-camp-card');
    expect(root).not.toBeNull();
    expect(root!.classList.contains('campanas-camp-card-dm')).toBe(true);
  });

  it('T5 WCL-CARD-LINK-06: link href is /campanas/{id}', () => {
    render(<V3CampCard campaign={{ ...baseCampaign, id: 'abc' }} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/campanas/abc');
  });
});
