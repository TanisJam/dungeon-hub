/**
 * Component tests for WorldSwitcher — REQ-WIS-02, REQ-WIS-04.
 *
 * (a) renders world list
 * (b) active world visually indicated
 * (c) tapping a row calls setActiveWorld
 * (d) tapping active world does NOT call setActiveWorld (REQ-WIS-02 scenario 2)
 * (e) zero worlds shows empty state + CTA (REQ-WIS-04 zero-worlds)
 * (f) each row ≥44px height (REQ-WIS-04 touch-target)
 */
import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { WorldRow } from '@/lib/api';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/navigation — router.refresh() used on world select
const mockRouterRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
  usePathname: () => '/inicio',
}));

// Mock setActiveWorld server action
const mockSetActiveWorld = vi.fn();
vi.mock('@/app/set-active-world', () => ({
  setActiveWorld: (...args: unknown[]) => mockSetActiveWorld(...args),
}));

// V3Sheet — render children directly without the portal/focus machinery for test simplicity.
vi.mock('@/components/ui/sheet', () => ({
  V3Sheet: ({ open, onClose, children, title }: {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="v3-sheet">
        {title && <h2>{title}</h2>}
        <button type="button" data-testid="sheet-close" onClick={onClose}>Close</button>
        {children}
      </div>
    ) : null,
}));

import { WorldSwitcher } from './world-switcher';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORLDS: WorldRow[] = [
  { id: 'world-1', name: 'Realm of Shadows', slug: 'realm-of-shadows' },
  { id: 'world-2', name: 'Sunlit Plains', slug: 'sunlit-plains' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorldSwitcher', () => {
  beforeEach(() => {
    mockRouterRefresh.mockReset();
    mockSetActiveWorld.mockReset().mockResolvedValue(undefined);
  });

  it('(a) renders world list when sheet is opened', async () => {
    render(
      <WorldSwitcher worlds={WORLDS} activeWorldId="world-1" callerRole="gm" />,
    );

    // Open the sheet
    const trigger = screen.getByRole('button', { name: /abrir selector/i });
    await act(async () => { fireEvent.click(trigger); });

    // Both world names should appear (at least once each — trigger also has active world name)
    expect(screen.getAllByText('Realm of Shadows').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Sunlit Plains')).toBeTruthy();
  });

  it('(b) active world row has aria-current="true" (visually indicated)', async () => {
    render(
      <WorldSwitcher worlds={WORLDS} activeWorldId="world-1" callerRole="gm" />,
    );

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /abrir selector/i })); });

    // The world rows in the sheet are buttons with data-active attribute
    // The active row has aria-current="true"
    const sheet = screen.getByTestId('v3-sheet');
    const activeBtn = sheet.querySelector('[aria-current="true"]');
    expect(activeBtn).toBeTruthy();
    expect(activeBtn?.textContent).toContain('Realm of Shadows');
  });

  it('(c) tapping a non-active row calls setActiveWorld and router.refresh()', async () => {
    render(
      <WorldSwitcher worlds={WORLDS} activeWorldId="world-1" callerRole="gm" />,
    );

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /abrir selector/i })); });

    // Click the inactive world — it's only in the sheet (not in the trigger)
    const sheet = screen.getByTestId('v3-sheet');
    const inactiveBtn = sheet.querySelector('[data-active="false"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(inactiveBtn);
    });

    expect(mockSetActiveWorld).toHaveBeenCalledWith('world-2');
    expect(mockRouterRefresh).toHaveBeenCalledOnce();
  });

  it('(d) tapping active world does NOT call setActiveWorld (REQ-WIS-02 scenario 2)', async () => {
    render(
      <WorldSwitcher worlds={WORLDS} activeWorldId="world-1" callerRole="gm" />,
    );

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /abrir selector/i })); });

    // Click the already-active world row (aria-current="true" in the sheet)
    const sheet = screen.getByTestId('v3-sheet');
    const activeBtn = sheet.querySelector('[aria-current="true"]') as HTMLElement;
    await act(async () => {
      fireEvent.click(activeBtn);
    });

    expect(mockSetActiveWorld).not.toHaveBeenCalled();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  it('(e) zero worlds shows empty state with create CTA (REQ-WIS-04 zero-worlds)', async () => {
    render(
      <WorldSwitcher worlds={[]} activeWorldId={null} callerRole={null} />,
    );

    // Trigger text falls back to "Mundo" when no active world
    // The trigger button should still exist
    const trigger = screen.getByRole('button', { name: /abrir selector/i });
    await act(async () => { fireEvent.click(trigger); });

    // Empty state text
    expect(screen.getByText(/todavía no tenés/i)).toBeTruthy();
    // CTA link to create
    const ctaLink = screen.getByRole('link', { name: /crear mundo/i });
    expect(ctaLink.getAttribute('href')).toBe('/campanas/new');
  });

  it('(f) each world row is at least 44px tall (REQ-WIS-04 touch-target — min-h-[44px] class)', async () => {
    render(
      <WorldSwitcher worlds={WORLDS} activeWorldId="world-1" callerRole="gm" />,
    );

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /abrir selector/i })); });

    // Both world rows should have min-h-[44px] class
    const worldButtons = screen.getAllByRole('button').filter((btn) =>
      btn.className.includes('min-h-[44px]'),
    );
    // At least as many rows as worlds
    expect(worldButtons.length).toBeGreaterThanOrEqual(WORLDS.length);
  });
});
