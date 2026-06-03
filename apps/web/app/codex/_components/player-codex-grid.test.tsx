/**
 * PlayerCodexGrid component test.
 * REQ-GRID-02: grid-cols-1 at base (375px) breakpoint; all 6 cards present.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { PlayerCodexGrid } from './player-codex-grid';

describe('PlayerCodexGrid', () => {
  it('REQ-GRID-01: renders exactly 6 category link cards', () => {
    render(<PlayerCodexGrid />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(6);
  });

  it('REQ-GRID-01: all 6 category labels are present', () => {
    render(<PlayerCodexGrid />);
    expect(screen.getByText('Monstruos')).toBeTruthy();
    expect(screen.getByText('Items')).toBeTruthy();
    expect(screen.getByText('Hechizos')).toBeTruthy();
    expect(screen.getByText('Razas')).toBeTruthy();
    expect(screen.getByText('Clases')).toBeTruthy();
    expect(screen.getByText('Trasfondos')).toBeTruthy();
  });

  it('REQ-GRID-01: each card links to the correct /codex/:kind href', () => {
    render(<PlayerCodexGrid />);
    const links = screen.getAllByRole('link') as HTMLAnchorElement[];
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/codex/monsters');
    expect(hrefs).toContain('/codex/items');
    expect(hrefs).toContain('/codex/spells');
    expect(hrefs).toContain('/codex/races');
    expect(hrefs).toContain('/codex/classes');
    expect(hrefs).toContain('/codex/backgrounds');
  });

  it('REQ-GRID-02: grid container has grid-cols-1 class (single column at base/375px breakpoint)', () => {
    const { container } = render(<PlayerCodexGrid />);
    // The wrapper div carries grid-cols-1 as a Tailwind base class (mobile-first)
    const grid = container.querySelector('div');
    expect(grid?.className).toContain('grid-cols-1');
  });

  it('REQ-GRID-02: each card has min-h-[80px] class (≥44px tap target)', () => {
    render(<PlayerCodexGrid />);
    const links = screen.getAllByRole('link');
    for (const link of links) {
      expect(link.className).toContain('min-h-[80px]');
    }
  });
});
