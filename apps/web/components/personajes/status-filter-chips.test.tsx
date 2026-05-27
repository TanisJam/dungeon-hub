import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mock next/navigation ─────────────────────────────────────────────────────
// StatusFilterChips calls useSearchParams().get('status') to determine active chip.
// We need to control what it returns per test.

const mockGet = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

import { StatusFilterChips } from './status-filter-chips';
import type { ChipCounts } from './types';

const counts: ChipCounts = { active: 3, pending: 1, retired: 2, all: 6 };

describe('StatusFilterChips', () => {
  it('renders 4 chip links with correct hrefs', () => {
    mockGet.mockReturnValue('active');
    render(<StatusFilterChips counts={counts} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/personajes?status=active');
    expect(hrefs).toContain('/personajes?status=pending');
    expect(hrefs).toContain('/personajes?status=retired');
    expect(hrefs).toContain('/personajes?status=all');
  });

  it('active chip has class personajes-chip-on when ?status=active', () => {
    mockGet.mockReturnValue('active');
    render(<StatusFilterChips counts={counts} />);
    const links = screen.getAllByRole('link');
    const activeLink = links.find((l) => l.getAttribute('href') === '/personajes?status=active');
    expect(activeLink?.className).toContain('personajes-chip-on');
    // others should not
    links
      .filter((l) => l.getAttribute('href') !== '/personajes?status=active')
      .forEach((l) => expect(l.className).not.toContain('personajes-chip-on'));
  });

  it('shows counts in Activos and Pendientes labels', () => {
    mockGet.mockReturnValue('active');
    render(<StatusFilterChips counts={counts} />);
    expect(screen.getByText('Activos · 3')).toBeTruthy();
    expect(screen.getByText('Pendientes · 1')).toBeTruthy();
  });

  it('Retirados and Todos chips show no count', () => {
    mockGet.mockReturnValue('all');
    render(<StatusFilterChips counts={counts} />);
    expect(screen.getByText('Retirados')).toBeTruthy();
    expect(screen.getByText('Todos')).toBeTruthy();
  });

  it('no ?status param (null) defaults to active chip highlighted', () => {
    mockGet.mockReturnValue(null);
    render(<StatusFilterChips counts={counts} />);
    const links = screen.getAllByRole('link');
    const activeLink = links.find((l) => l.getAttribute('href') === '/personajes?status=active');
    expect(activeLink?.className).toContain('personajes-chip-on');
  });
});
