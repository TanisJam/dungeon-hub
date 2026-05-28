/**
 * Tests for DMNextSessionCard component
 *
 * REQ-IDM-NEXT-SESSION-CARD-04: renders Dirigís pill, title, tagline, player/quest/session pills
 * REQ-IDM-CSS-SCOPED-08: root element has class inicio-camp-dm-bg
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DMNextSessionCard } from './dm-next-session-card';
import { MOCK_DM_NEXT_CAMPAIGN } from '../dm-mock-data';

describe('DMNextSessionCard', () => {
  it('T1: renders Dirigís pill, player count, quest count, and next session number', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    // MOCK_DM_NEXT_CAMPAIGN: players=4, pendingQuests=3, sessions=7
    expect(container.textContent).toContain('Dirigís');
    expect(container.textContent).toContain('4 jugadores');
    expect(container.textContent).toContain('3 quests activas');
    expect(container.textContent).toContain('Sesión 8'); // sessions+1 = 7+1 = 8
  });

  it('T2: root element has class inicio-camp-dm-bg', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    expect(container.querySelector('.inicio-camp-dm-bg')).toBeTruthy();
  });

  it('T3: Dirigís pill element has class inicio-camp-dm-role-pill containing "absolute"', () => {
    const { container } = render(<DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />);
    const pill = container.querySelector('.inicio-camp-dm-role-pill');
    expect(pill).toBeTruthy();
    expect(pill!.className).toContain('absolute');
  });

  it('T4 (edge): sessions=0 renders "Sesión 1"', () => {
    const zeroCampaign = { ...MOCK_DM_NEXT_CAMPAIGN, sessions: 0 };
    const { container } = render(<DMNextSessionCard campaign={zeroCampaign} />);
    expect(container.textContent).toContain('Sesión 1');
  });
});
