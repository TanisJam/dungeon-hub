/**
 * DmControls component tests.
 * REQ-DPPMB-CTRL-01, REQ-DPPMB-CTRL-02, REQ-DPPMB-CTRL-03, REQ-DPPMB-CTRL-04.
 * REQ-DPPMB-CT-03: exact button set per status; hidden for non-GM;
 *   "Completar sesión" only on active/paused; cancel confirm dialog.
 *
 * NOTE: afterEach(cleanup) is NOT declared here — global via apps/web/vitest.setup.ts.
 *
 * Mocking strategy:
 *   - Server actions (startSession, pauseSession, resumeSession, cancelSession) mocked via vi.mock.
 *   - CompleteForm mocked to a stub so we test DmControls in isolation.
 *   - V3Sheet mocked to a simple div that renders children when open=true.
 *
 * State-machine map (LOCAL copy, mirrors state-machine.ts):
 *   scheduled → [Iniciar, Cancelar]
 *   active    → [Pausar, Completar, Cancelar]
 *   paused    → [Reanudar, Completar, Cancelar]
 *   completed → none
 *   cancelled → none
 */

import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DmControls } from './dm-controls';
import type { SessionStatus } from '@/app/campanas/[id]/sessions/actions';

// ── Mock Server Actions ────────────────────────────────────────────────────────
vi.mock('@/app/campanas/[id]/sessions/actions', () => ({
  startSession: vi.fn(),
  pauseSession: vi.fn(),
  resumeSession: vi.fn(),
  cancelSession: vi.fn(),
  // completeSession is called inside CompleteForm — not directly tested here
}));

import {
  startSession,
  pauseSession,
  resumeSession,
  cancelSession,
} from '@/app/campanas/[id]/sessions/actions';

// ── Mock CompleteForm ─────────────────────────────────────────────────────────
vi.mock('./complete-form', () => ({
  CompleteForm: ({
    open,
    onClose,
  }: {
    open: boolean;
    onClose: () => void;
    sessionId: string;
    campaignId: string;
    participants: unknown[];
  }) =>
    open ? (
      <div data-testid="complete-form-mock">
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    ) : null,
}));

// ── Mock V3Sheet ──────────────────────────────────────────────────────────────
// V3Sheet uses portals — not compatible with jsdom without extra setup.
vi.mock('@/components/ui/sheet', () => ({
  V3Sheet: ({
    open,
    onClose,
    title,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="v3-sheet">
        {title && <div>{title}</div>}
        {children}
        <button type="button" onClick={onClose} data-testid="sheet-close">
          Cerrar hoja
        </button>
      </div>
    ) : null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockStart = startSession as ReturnType<typeof vi.fn>;
const mockPause = pauseSession as ReturnType<typeof vi.fn>;
const mockResume = resumeSession as ReturnType<typeof vi.fn>;
const mockCancel = cancelSession as ReturnType<typeof vi.fn>;

function renderControls({
  status = 'scheduled' as SessionStatus,
  accessLevel = 'gm' as 'gm' | 'participant' | 'campaign-member',
  sessionId = 'sess-1',
  campaignId = 'camp-1',
  participants = [] as Array<{ characterId: string; userId: string; name: string; leftAt: string | null }>,
} = {}) {
  return render(
    <DmControls
      sessionId={sessionId}
      campaignId={campaignId}
      status={status}
      accessLevel={accessLevel}
      participants={participants}
    />,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DmControls', () => {
  beforeEach(() => {
    mockStart.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    mockCancel.mockReset();
  });

  // ── REQ-DPPMB-CTRL-01: hidden for non-GM ────────────────────────────────────

  it('renders nothing when accessLevel is "participant"', () => {
    const { container } = renderControls({ status: 'active', accessLevel: 'participant' });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when accessLevel is "campaign-member"', () => {
    const { container } = renderControls({ status: 'active', accessLevel: 'campaign-member' });
    expect(container.firstChild).toBeNull();
  });

  // ── REQ-DPPMB-CTRL-02 + CT-03: exact button set per status ──────────────────

  it('shows only "Iniciar" and "Cancelar" when status is "scheduled"', () => {
    renderControls({ status: 'scheduled' });
    expect(screen.getByRole('button', { name: /iniciar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pausar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reanudar/i })).toBeNull();
  });

  it('shows "Pausar", "Completar sesión" and "Cancelar" when status is "active"', () => {
    renderControls({ status: 'active' });
    expect(screen.getByRole('button', { name: /pausar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /completar sesión/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /iniciar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reanudar/i })).toBeNull();
  });

  it('shows "Reanudar", "Completar sesión" and "Cancelar" when status is "paused"', () => {
    renderControls({ status: 'paused' });
    expect(screen.getByRole('button', { name: /reanudar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /completar sesión/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pausar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /iniciar/i })).toBeNull();
  });

  it('shows no action buttons when status is "completed"', () => {
    const { container } = renderControls({ status: 'completed', accessLevel: 'gm' });
    // Renders nothing for terminal state
    expect(container.firstChild).toBeNull();
  });

  it('shows no action buttons when status is "cancelled"', () => {
    const { container } = renderControls({ status: 'cancelled', accessLevel: 'gm' });
    expect(container.firstChild).toBeNull();
  });

  // ── REQ-DPPMB-CTRL-04: "Completar sesión" only on active/paused ─────────────

  it('"Completar sesión" is NOT visible when status is "scheduled"', () => {
    renderControls({ status: 'scheduled' });
    expect(screen.queryByRole('button', { name: /completar sesión/i })).toBeNull();
  });

  // ── REQ-DPPMB-CTRL-03: cancel confirm dialog ──────────────────────────────────

  it('shows a confirm dialog when "Cancelar" is clicked', () => {
    renderControls({ status: 'active' });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    // Dialog or confirmation text should appear
    expect(screen.getByText(/cancelar la sesión|no se puede deshacer/i)).toBeTruthy();
  });

  it('does NOT call cancelSession before the user confirms', () => {
    renderControls({ status: 'active' });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('calls cancelSession after the user confirms', async () => {
    mockCancel.mockResolvedValueOnce({ ok: true, data: {} });
    renderControls({ status: 'active' });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => {
      expect(mockCancel).toHaveBeenCalledWith('sess-1', 'camp-1');
    });
  });

  // ── Transition actions ────────────────────────────────────────────────────────

  it('calls startSession when "Iniciar" is clicked', async () => {
    mockStart.mockResolvedValueOnce({ ok: true, data: {} });
    renderControls({ status: 'scheduled' });
    fireEvent.click(screen.getByRole('button', { name: /iniciar/i }));
    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledWith('sess-1', 'camp-1');
    });
  });

  it('calls pauseSession when "Pausar" is clicked', async () => {
    mockPause.mockResolvedValueOnce({ ok: true, data: {} });
    renderControls({ status: 'active' });
    fireEvent.click(screen.getByRole('button', { name: /pausar/i }));
    await waitFor(() => {
      expect(mockPause).toHaveBeenCalledWith('sess-1', 'camp-1');
    });
  });

  it('calls resumeSession when "Reanudar" is clicked', async () => {
    mockResume.mockResolvedValueOnce({ ok: true, data: {} });
    renderControls({ status: 'paused' });
    fireEvent.click(screen.getByRole('button', { name: /reanudar/i }));
    await waitFor(() => {
      expect(mockResume).toHaveBeenCalledWith('sess-1', 'camp-1');
    });
  });

  // ── "Completar sesión" opens CompleteForm ─────────────────────────────────────

  it('opens the CompleteForm when "Completar sesión" is clicked', () => {
    renderControls({ status: 'active' });
    fireEvent.click(screen.getByRole('button', { name: /completar sesión/i }));
    expect(screen.getByTestId('complete-form-mock')).toBeTruthy();
  });

  it('closes the CompleteForm when onClose is invoked', () => {
    renderControls({ status: 'active' });
    fireEvent.click(screen.getByRole('button', { name: /completar sesión/i }));
    expect(screen.getByTestId('complete-form-mock')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(screen.queryByTestId('complete-form-mock')).toBeNull();
  });
});
