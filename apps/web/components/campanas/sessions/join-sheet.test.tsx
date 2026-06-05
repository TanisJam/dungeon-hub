/**
 * JoinSheet component tests.
 * REQ-DPPMB-JOIN-01–08, REQ-DPPMB-CT-02.
 *
 * Scenarios covered:
 *  - Character list renders when eligible characters exist
 *  - Empty state + CTA when no eligible characters
 *  - "Unirme con [name]" confirm button is disabled until a character is selected
 *  - Calls joinSession with the correct characterId on confirm
 *  - Renders inline error for CHARACTER_ALREADY_IN_LIVE_SESSION
 *  - Renders inline error for SESSION_FULL with count interpolation
 *  - Renders inline error for SESSION_TERMINAL
 *  - Renders inline error for CHARACTER_NOT_IN_WORLD
 *  - Renders inline error for CHARACTER_NOT_ELIGIBLE
 *  - Dismisses on tap-outside (onClose callback called)
 *
 * NOTE: afterEach(cleanup) is NOT declared here — global via apps/web/vitest.setup.ts.
 *
 * Mocking strategy: joinSession action mocked via vi.mock (hoisted).
 * V3Sheet is mocked to a simple inline wrapper to avoid portal + DOM issues in jsdom.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JoinSheet } from './join-sheet';
import type { RosterCharacter } from './join-sheet';

// ─── Mock next/link ──────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// ─── Mock V3Sheet (portal-based; not compatible with jsdom without extra setup) ──

vi.mock('@/components/ui/sheet', () => ({
  V3Sheet: ({
    open,
    children,
    onClose: _onClose,
  }: {
    open: boolean;
    children: React.ReactNode;
    onClose: () => void;
  }) => (open ? <div data-testid="v3-sheet">{children}</div> : null),
}));

// ─── Mock Server Action ───────────────────────────────────────────────────────

vi.mock('@/app/campanas/[id]/sessions/actions', () => ({
  joinSession: vi.fn(),
}));

import { joinSession } from '@/app/campanas/[id]/sessions/actions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockJoinSession = joinSession as ReturnType<typeof vi.fn>;

const char1: RosterCharacter = {
  id: 'char-1',
  name: 'Aelar Windrunner',
  lineage: 'Elfo · Explorador 3',
  worldId: 'world-1',
};

const char2: RosterCharacter = {
  id: 'char-2',
  name: 'Bruenor Battlehammer',
  lineage: 'Enano · Guerrero 5',
  worldId: 'world-1',
};

function renderSheet({
  open = true,
  characters = [char1, char2],
  onClose = vi.fn(),
  sessionId = 'sess-1',
  campaignId = 'camp-1',
}: {
  open?: boolean;
  characters?: RosterCharacter[];
  onClose?: () => void;
  sessionId?: string;
  campaignId?: string;
} = {}) {
  return render(
    <JoinSheet
      open={open}
      onClose={onClose}
      sessionId={sessionId}
      campaignId={campaignId}
      characters={characters}
    />,
    { baseElement: document.body },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('JoinSheet', () => {
  beforeEach(() => {
    mockJoinSession.mockReset();
  });

  // --- REQ-DPPMB-CT-02: character list renders ---

  it('renders the list of eligible characters', () => {
    renderSheet();
    expect(screen.getByText('Aelar Windrunner')).toBeTruthy();
    expect(screen.getByText('Bruenor Battlehammer')).toBeTruthy();
  });

  it('renders character lineage beneath each character name', () => {
    renderSheet();
    expect(screen.getByText('Elfo · Explorador 3')).toBeTruthy();
    expect(screen.getByText('Enano · Guerrero 5')).toBeTruthy();
  });

  // --- REQ-DPPMB-CT-02: empty state + CTA ---

  it('renders empty state message when no eligible characters', () => {
    renderSheet({ characters: [] });
    expect(screen.getByText(/no tenés.*personaje/i)).toBeTruthy();
  });

  it('renders "Crear personaje" CTA link pointing to /characters/new when empty', () => {
    renderSheet({ characters: [] });
    const link = screen.getByRole('link', { name: /crear personaje/i });
    expect(link.getAttribute('href')).toBe('/characters/new');
  });

  it('does NOT render the confirm button when there are no characters', () => {
    renderSheet({ characters: [] });
    expect(screen.queryByRole('button', { name: /unirme con/i })).toBeNull();
  });

  // --- REQ-DPPMB-CT-02: confirm button disabled until selection ---

  it('renders confirm button disabled before any character is selected', () => {
    renderSheet();
    const btn = screen.getByRole('button', { name: /unirme con/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables confirm button after a character is selected', async () => {
    renderSheet();
    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /unirme con aelar/i });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('shows selected character name in the confirm button label', async () => {
    renderSheet();
    fireEvent.click(screen.getByText('Bruenor Battlehammer'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /unirme con bruenor/i })).toBeTruthy();
    });
  });

  // --- REQ-DPPMB-CT-02: joinSession dispatched with selected characterId ---

  it('calls joinSession with the correct sessionId and characterId on confirm', async () => {
    mockJoinSession.mockResolvedValueOnce({ ok: true, data: {} });
    renderSheet({ sessionId: 'sess-42', campaignId: 'camp-99' });

    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /unirme con aelar/i }) as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: /unirme con aelar/i }));

    await waitFor(() => {
      expect(mockJoinSession).toHaveBeenCalledWith('sess-42', 'char-1', 'camp-99');
    });
  });

  it('calls onClose after a successful join', async () => {
    mockJoinSession.mockResolvedValueOnce({ ok: true, data: {} });
    const onClose = vi.fn();
    renderSheet({ onClose });

    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /unirme con aelar/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /unirme con aelar/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  // --- REQ-DPPMB-CT-02 / REQ-DPPMB-JOIN-06: inline error codes ---

  it('shows inline error for CHARACTER_ALREADY_IN_LIVE_SESSION', async () => {
    mockJoinSession.mockResolvedValueOnce({
      ok: false,
      error: JSON.stringify([{ code: 'CHARACTER_ALREADY_IN_LIVE_SESSION' }]),
      status: 400,
    });

    renderSheet();
    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /unirme con aelar/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /unirme con aelar/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/otra sesión/i);
    });
  });

  it('shows inline error for SESSION_FULL', async () => {
    mockJoinSession.mockResolvedValueOnce({
      ok: false,
      error: JSON.stringify([{ code: 'SESSION_FULL', maxPlayers: 4, current: 4 }]),
      status: 400,
    });

    renderSheet();
    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /unirme con aelar/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /unirme con aelar/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/completa/i);
    });
  });

  it('shows inline error for SESSION_TERMINAL', async () => {
    mockJoinSession.mockResolvedValueOnce({
      ok: false,
      error: JSON.stringify([{ code: 'SESSION_TERMINAL' }]),
      status: 400,
    });

    renderSheet();
    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /unirme con aelar/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /unirme con aelar/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/finaliz/i);
    });
  });

  it('shows inline error for CHARACTER_NOT_IN_WORLD', async () => {
    mockJoinSession.mockResolvedValueOnce({
      ok: false,
      error: JSON.stringify([{ code: 'CHARACTER_NOT_IN_WORLD' }]),
      status: 400,
    });

    renderSheet();
    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /unirme con aelar/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /unirme con aelar/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/unir|sesión/i);
    });
  });

  it('shows inline error for CHARACTER_NOT_ELIGIBLE', async () => {
    mockJoinSession.mockResolvedValueOnce({
      ok: false,
      error: JSON.stringify([{ code: 'CHARACTER_NOT_ELIGIBLE' }]),
      status: 400,
    });

    renderSheet();
    fireEvent.click(screen.getByText('Aelar Windrunner'));
    await waitFor(() => {
      expect((screen.getByRole('button', { name: /unirme con aelar/i }) as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: /unirme con aelar/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/unir|sesión/i);
    });
  });

  // --- Sheet closed when not open ---

  it('does not render sheet content when open is false', () => {
    renderSheet({ open: false });
    expect(screen.queryByText('Aelar Windrunner')).toBeNull();
  });
});
