/**
 * D.2 — Wizard layout TermProvider wiring contract tests.
 *
 * The wizard layout (app/characters/[id]/wizard/layout.tsx) is a Next.js 15
 * async server component that mounts TermProvider. Because vitest's include
 * pattern covers `components/**` and `lib/**` only (not `app/**`), we cannot
 * render the layout directly. Instead we test the WIRING CONTRACT — that:
 *
 *   1. TermProvider accepts session access_token + campaignId (real props)
 *   2. When those props are present, hover interactions work (live path)
 *   3. When accessToken is null (no session / logged-out), refs are inert
 *
 * These tests mirror exactly what the layout wires up.
 *
 * Note: This is documented as a manual integration verification step per task D.2,
 * because full server component rendering requires mocking next/headers and cookies()
 * which is outside this project's vitest scope. The unit tests below validate the
 * TermProvider contract the layout relies on.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { TermProvider } from '../TermProvider';

// ---------------------------------------------------------------------------
// Helpers — simulated session props as the wizard layout would pass them
// ---------------------------------------------------------------------------

const REAL_SESSION_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.real-token';
const REAL_CAMPAIGN_ID = 'campaign-uuid-12345';
const REAL_API_BASE_URL = 'http://localhost:4000';
const OPEN_DELAY = 120;

function makeSessionResolver(entry: { name: string }) {
  return vi.fn().mockResolvedValue({
    kind: 'ok' as const,
    entry: { name: entry.name, entries: [], source: 'PHB' },
  });
}

// ---------------------------------------------------------------------------
// D.2 — TermProvider wiring: real accessToken + campaignId → hover works
// ---------------------------------------------------------------------------

describe('wizard layout wiring — TermProvider with real session props', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('opens hover card when session accessToken and campaignId are provided (real wiring path)', async () => {
    const resolver = makeSessionResolver({ name: 'Fireball' });

    render(
      <TermProvider
        accessToken={REAL_SESSION_TOKEN}
        campaignId={REAL_CAMPAIGN_ID}
        apiBaseUrl={REAL_API_BASE_URL}
        mockMode={resolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref">fireball</span>
      </TermProvider>,
    );

    fireEvent.pointerOver(screen.getByTestId('ref'));

    // No card before delay
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    // Card opens with real props — confirms TermProvider accepts session token + campaignId
    const dialog = screen.queryByRole('dialog');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Fireball');
  });

  it('keeps refs inert when accessToken is null (no active session)', async () => {
    const resolver = vi.fn();

    render(
      <TermProvider
        accessToken={null}
        campaignId={REAL_CAMPAIGN_ID}
        apiBaseUrl={REAL_API_BASE_URL}
        mockMode={resolver}
      >
        <span data-compendium-ref="spell|fireball|PHB" data-testid="ref">fireball</span>
      </TermProvider>,
    );

    fireEvent.pointerOver(screen.getByTestId('ref'));
    await act(async () => {
      vi.advanceTimersByTime(OPEN_DELAY + 10);
      await Promise.resolve();
    });

    expect(resolver).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
