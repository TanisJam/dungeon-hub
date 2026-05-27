/**
 * Component tests for RecursosTab.
 * Covers REQ-BRD-WEB-LABEL + REQ-BRD-WEB-DIE-BADGE from
 * sdd/class-resource-bardic-inspiration/spec (#930).
 *
 * PHB p.53-54 — Bardic Inspiration label + die-size table.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecursosTab } from './recursos';
import type { ClassResourceView } from '@/lib/sheet-types';

vi.mock('../actions', () => ({
  useClassResource: vi.fn().mockResolvedValue({ ok: true }),
  restoreClassResource: vi.fn().mockResolvedValue({ ok: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const bardicL1: ClassResourceView = {
  slug: 'bard:bardic-inspiration',
  classSlug: 'bard',
  used: 0,
  max: 2,
  recoveryTrigger: 'long',
  extra: { dieSize: 'd6' },
};

const bardicL10: ClassResourceView = {
  ...bardicL1,
  max: 3,
  recoveryTrigger: 'short',
  extra: { dieSize: 'd10' },
};

const secondWind: ClassResourceView = {
  slug: 'fighter:second-wind',
  classSlug: 'fighter',
  used: 0,
  max: 1,
  recoveryTrigger: 'short',
};

describe('RecursosTab — Bardic Inspiration', () => {
  it('renders Spanish label + class label', () => {
    render(
      <RecursosTab
        characterId="char-1"
        classResources={{ 'bard:bardic-inspiration': bardicL1 }}
      />,
    );
    expect(screen.getByText('Inspiración bárdica')).toBeTruthy();
    expect(screen.getByText(/Bardo/)).toBeTruthy();
  });

  it('renders d6 die badge at Bard L1 (PHB p.54 table)', () => {
    render(
      <RecursosTab
        characterId="char-1"
        classResources={{ 'bard:bardic-inspiration': bardicL1 }}
      />,
    );
    const badge = screen.getByTestId('resource-die-badge');
    expect(badge.textContent).toBe('d6');
  });

  it('renders d10 die badge at Bard L10 (PHB p.54 table)', () => {
    render(
      <RecursosTab
        characterId="char-1"
        classResources={{ 'bard:bardic-inspiration': bardicL10 }}
      />,
    );
    const badge = screen.getByTestId('resource-die-badge');
    expect(badge.textContent).toBe('d10');
  });

  it('does NOT render die badge for Fighter Second Wind (no extra)', () => {
    render(
      <RecursosTab
        characterId="char-1"
        classResources={{ 'fighter:second-wind': secondWind }}
      />,
    );
    expect(screen.queryByTestId('resource-die-badge')).toBeNull();
  });
});
