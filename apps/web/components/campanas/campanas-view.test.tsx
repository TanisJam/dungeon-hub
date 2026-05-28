import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CampanasView } from './campanas-view';
import type { CampaignSummary } from './types';

const playerCamp: CampaignSummary = {
  id: 'p1',
  name: 'Tres Lunas',
  gmUserId: 'gm-other',
  worldId: 'w-p',
  createdAt: '2026-01-01T00:00:00Z',
  memberRole: 'player',
  playersCount: 5,
  sessionsCount: 7,
  nextSession: null,
  pendingFichas: null,
};
const gmCamp: CampaignSummary = {
  id: 'g1',
  name: 'El Pacto en la Torre',
  gmUserId: 'me',
  worldId: 'w-g',
  createdAt: '2026-01-01T00:00:00Z',
  memberRole: 'gm',
  playersCount: 5,
  sessionsCount: 4,
  nextSession: null,
  pendingFichas: 3,
};

describe('CampanasView (WCL-ROLE-BRANCH-01)', () => {
  it('dm role: only "Tus campañas como DM" section, NOT "Donde jugás"', () => {
    render(<CampanasView role="dm" campaigns={[gmCamp, playerCamp]} />);
    expect(screen.getByText('Tus campañas como DM')).toBeTruthy();
    expect(screen.queryByText('Donde jugás')).toBeNull();
  });

  it('player role with GM campaigns: both "Donde jugás" AND "Donde dirigís"', () => {
    render(<CampanasView role="player" campaigns={[playerCamp, gmCamp]} />);
    expect(screen.getByText('Donde jugás')).toBeTruthy();
    expect(screen.getByText('Donde dirigís')).toBeTruthy();
  });

  it('player role with no GM campaigns: "Donde dirigís" section is hidden', () => {
    render(<CampanasView role="player" campaigns={[playerCamp]} />);
    expect(screen.getByText('Donde jugás')).toBeTruthy();
    expect(screen.queryByText('Donde dirigís')).toBeNull();
  });
});
