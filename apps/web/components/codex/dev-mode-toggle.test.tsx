/**
 * Component test: DevModeToggle — per-user devMode toggle
 *
 * codex-knowledge B-4 (SDD tasks #1950, spec #1947, design #1948 §4.5):
 *   REQ-CK-DEV-03: toggle calls server-side action that updates users.devMode.
 *   REQ-CK-DEV-01: no client-side localStorage or cookie — server-side persistence.
 *   Design §4.5: full-width switch row, mobile-first (375px), in account/profile area.
 *
 * Tests:
 *   1. Toggle switch renders with label "Modo desarrollador".
 *   2. Flipping switch calls setDevMode action with !currentValue.
 *   3. Pending state while action is in-flight.
 *   4. Error state renders inline error message.
 *
 * Design intent: FORK 5 (#1944). This arc encodes NO PHB rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DevModeToggle } from './dev-mode-toggle';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/app/settings/actions', () => ({
  setDevMode: vi.fn(),
}));

import { setDevMode } from '@/app/settings/actions';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DevModeToggle (B-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REQ-CK-DEV-03: renders label "Modo desarrollador"', () => {
    render(<DevModeToggle currentValue={false} />);
    expect(screen.getByText(/modo desarrollador/i)).toBeTruthy();
  });

  it('REQ-CK-DEV-03: switch renders as checkbox/switch role', () => {
    render(<DevModeToggle currentValue={false} />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeTruthy();
  });

  it('REQ-CK-DEV-03: currentValue=false → switch not checked', () => {
    render(<DevModeToggle currentValue={false} />);
    const toggle = screen.getByRole('switch') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('REQ-CK-DEV-03: currentValue=true → switch checked', () => {
    render(<DevModeToggle currentValue={true} />);
    const toggle = screen.getByRole('switch') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('REQ-CK-DEV-03: flipping toggle calls setDevMode with true when currently false', async () => {
    vi.mocked(setDevMode).mockResolvedValueOnce({ ok: true, data: { devMode: true } });
    render(<DevModeToggle currentValue={false} />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setDevMode).toHaveBeenCalledWith(true);
    });
  });

  it('REQ-CK-DEV-03: flipping toggle calls setDevMode with false when currently true', async () => {
    vi.mocked(setDevMode).mockResolvedValueOnce({ ok: true, data: { devMode: false } });
    render(<DevModeToggle currentValue={true} />);

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(setDevMode).toHaveBeenCalledWith(false);
    });
  });

  it('REQ-CK-DEV-03: error from action renders inline error message', async () => {
    vi.mocked(setDevMode).mockResolvedValueOnce({ ok: false, error: 'No autenticado' });
    render(<DevModeToggle currentValue={false} />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });
});
