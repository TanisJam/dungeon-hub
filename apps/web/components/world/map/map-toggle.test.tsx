/**
 * map-toggle.test.tsx — Unit tests for MapToggle segmented control.
 *
 * REQ-WM-02: toggle renders Lista/Mapa buttons, defaults Lista active,
 * and pushes correct ?view= URL param on click.
 *
 * NOTE: afterEach(cleanup) is already global via apps/web/vitest.setup.ts — do NOT re-add.
 * Assertion style: .toBeTruthy() / .toBeNull() (no @testing-library/jest-dom).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mock next/navigation ─────────────────────────────────────────────────────
// MapToggle calls useRouter().push() to navigate.

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

import { MapToggle } from './map-toggle';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mock window.location.search so router.push receives the right query string.
 * MapToggle reads window.location.search to preserve other params.
 */
function setLocationSearch(search: string) {
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { ...window.location, search },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MapToggle (REQ-WM-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocationSearch('');
  });

  it('(a) renders both Lista and Mapa buttons', () => {
    render(<MapToggle />);
    expect(screen.queryByRole('button', { name: 'Lista' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mapa' })).toBeTruthy();
  });

  it('(b) Lista is the default active state when no activeView prop is provided', () => {
    render(<MapToggle />);
    const listaBtn = screen.getByRole('button', { name: 'Lista' });
    const mapaBtn = screen.getByRole('button', { name: 'Mapa' });
    // aria-pressed reflects the active state
    expect(listaBtn.getAttribute('aria-pressed')).toBe('true');
    expect(mapaBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('(b) lista is active when activeView="lista"', () => {
    render(<MapToggle activeView="lista" />);
    const listaBtn = screen.getByRole('button', { name: 'Lista' });
    expect(listaBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('(b) mapa is active when activeView="mapa"', () => {
    render(<MapToggle activeView="mapa" />);
    const mapaBtn = screen.getByRole('button', { name: 'Mapa' });
    expect(mapaBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('(c) clicking Mapa calls router.push with ?view=mapa', () => {
    setLocationSearch('');
    render(<MapToggle activeView="lista" />);
    const mapaBtn = screen.getByRole('button', { name: 'Mapa' });
    fireEvent.click(mapaBtn);
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledWith: string = mockPush.mock.calls[0][0];
    expect(calledWith).toContain('view=mapa');
  });

  it('(d) clicking Lista calls router.push with ?view=lista', () => {
    setLocationSearch('');
    render(<MapToggle activeView="mapa" />);
    const listaBtn = screen.getByRole('button', { name: 'Lista' });
    fireEvent.click(listaBtn);
    expect(mockPush).toHaveBeenCalledTimes(1);
    const calledWith: string = mockPush.mock.calls[0][0];
    expect(calledWith).toContain('view=lista');
  });

  it('clicking the already-active view still calls router.push (URL idempotent)', () => {
    render(<MapToggle activeView="lista" />);
    const listaBtn = screen.getByRole('button', { name: 'Lista' });
    fireEvent.click(listaBtn);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
