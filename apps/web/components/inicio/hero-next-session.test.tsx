/**
 * Unit tests for HeroNextSession component.
 *
 * T1: Renders eyebrow "Próxima sesión", campaign name, tagline,
 *     daysToSession number, and Pill text "Sesión 8" (sessions: 7 → next is 8).
 * T2: Root <section> element has class inicio-hero-bg.
 * T3: Countdown number <span> has class inicio-stat-glow.
 * T4: daysToSession=0 renders "0" in the number span (edge case — HERO-01).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroNextSession } from './hero-next-session';
import type { NextCampaign } from './types';

const mockCampaign: NextCampaign = {
  id: 'mock-camp-1',
  name: 'Las Tres Lunas',
  tagline: 'Una pacto se rompe bajo el cielo gemelo',
  daysToSession: 2,
  nextSession: 'VIE 21:30',
  sessions: 7,
};

describe('HeroNextSession', () => {
  it('T1: renders eyebrow, campaign name, tagline, day count, and session pill', () => {
    render(<HeroNextSession campaign={mockCampaign} />);
    expect(screen.getByText('Próxima sesión')).toBeTruthy();
    expect(screen.getByText('Las Tres Lunas')).toBeTruthy();
    expect(screen.getByText('Una pacto se rompe bajo el cielo gemelo')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    // sessions=7 → next is 8
    expect(screen.getByText(/Sesión 8/)).toBeTruthy();
  });

  it('T2: root section element has class inicio-hero-bg', () => {
    const { container } = render(<HeroNextSession campaign={mockCampaign} />);
    const section = container.querySelector('section');
    expect(section).toBeTruthy();
    expect(section!.className).toContain('inicio-hero-bg');
  });

  it('T3: countdown number span has class inicio-stat-glow', () => {
    const { container } = render(<HeroNextSession campaign={mockCampaign} />);
    const numSpan = container.querySelector('.inicio-stat-glow');
    expect(numSpan).toBeTruthy();
    expect(numSpan!.textContent?.trim()).toBe('2');
  });

  it('T4: daysToSession=0 renders "0" in the countdown number span', () => {
    const zeroCampaign: NextCampaign = { ...mockCampaign, daysToSession: 0 };
    const { container } = render(<HeroNextSession campaign={zeroCampaign} />);
    const numSpan = container.querySelector('.inicio-stat-glow');
    expect(numSpan).toBeTruthy();
    expect(numSpan!.textContent?.trim()).toBe('0');
  });

  // CT-02 T5: CTA link renders with correct href — REQ-DPPMD-CTA-PLAYER-01
  it('T5: renders CTA link with href /campanas/{campaign.id}', () => {
    const campaignWithId: NextCampaign = { ...mockCampaign, id: 'camp-test' };
    render(<HeroNextSession campaign={campaignWithId} />);
    const link = screen.getByRole('link', { name: /ver sesiones/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/campanas/camp-test');
  });

  // CT-02 T6: CTA link text is 'Ver sesiones' — REQ-DPPMD-CTA-PLAYER-01
  it('T6: CTA link text is "Ver sesiones"', () => {
    render(<HeroNextSession campaign={mockCampaign} />);
    expect(screen.getByRole('link', { name: /ver sesiones/i })).toBeTruthy();
  });
});
