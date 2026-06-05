/**
 * Tests for DMNextSessionCard component
 *
 * REQ-IDM-NEXT-SESSION-CARD-04: renders Dirigís pill, title, player/session pills
 * REQ-IDM-CSS-SCOPED-08: root element has class inicio-camp-dm-bg
 *
 * Note: tagline and pendingQuests are optional (no backend source) — tested separately below.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DMNextSessionCard } from './dm-next-session-card';
import type { DMCampaignNextSession } from '../types';

const MOCK_DM_NEXT_CAMPAIGN: DMCampaignNextSession = {
  id: 'mock-dm-camp-1',
  name: 'El Pacto de las Tres Lunas',
  nextSession: 'VIE 21:30',
  players: 4,
  sessions: 7,
};

describe('DMNextSessionCard', () => {
  it('T1: renders Dirigís pill, player count, and next session number', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    // MOCK_DM_NEXT_CAMPAIGN: players=4, sessions=7
    expect(container.textContent).toContain('Dirigís');
    expect(container.textContent).toContain('4 jugadores');
    expect(container.textContent).toContain('Sesión 8'); // sessions+1 = 7+1 = 8
  });

  it('T1b: renders pendingQuests pill when provided', () => {
    const withQuests = { ...MOCK_DM_NEXT_CAMPAIGN, pendingQuests: 3 };
    const { container } = render(<DMNextSessionCard campaign={withQuests} />);
    expect(container.textContent).toContain('3 quests activas');
  });

  it('T1c: does NOT render quests pill when pendingQuests is absent', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    expect(container.textContent).not.toContain('quests activas');
  });

  it('T2: root element has class inicio-camp-dm-bg', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    expect(container.querySelector('.inicio-camp-dm-bg')).toBeTruthy();
  });

  it('T3: Dirigís pill is a <Pill> atom with data-tone="secondary" and class absolute', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    const pill = container.querySelector('[data-tone="secondary"]');
    expect(pill).toBeTruthy();
    expect(pill!.className).toContain('absolute');
  });

  it('T4 (edge): sessions=0 renders "Sesión 1"', () => {
    const zeroCampaign = { ...MOCK_DM_NEXT_CAMPAIGN, sessions: 0 };
    const { container } = render(<DMNextSessionCard campaign={zeroCampaign} />);
    expect(container.textContent).toContain('Sesión 1');
  });

  // CT-03 T5: CTA link renders with correct href — REQ-DPPMD-CTA-DM-01
  it('T5: renders CTA link with href /campanas/{campaign.id}', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    expect(container.querySelector('a[href="/campanas/mock-dm-camp-1"]')).toBeTruthy();
  });

  // CT-03 T6: CTA link text is 'Crear sesión' — REQ-DPPMD-CTA-DM-01
  it('T6: CTA link text is "Crear sesión"', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    expect(container.textContent).toContain('Crear sesión');
  });

  // CT-03 T7: CTA does NOT have primary button styling — REQ-DPPMD-CTA-DM-05
  it('T7: CTA does not have primary bg-accent styling', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    const ctaLink = container.querySelector('a[href*="/campanas/"]');
    expect(ctaLink?.className).not.toContain('bg-accent');
  });
});
