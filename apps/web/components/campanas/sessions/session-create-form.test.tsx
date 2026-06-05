/**
 * SessionCreateForm component tests.
 * REQ-DPPMB-CREATE-02, REQ-DPPMB-CREATE-03, REQ-DPPMB-CREATE-05, REQ-DPPMB-CREATE-06.
 * REQ-DPPMB-CT-04: title required; levelMin>levelMax blocked client-side without API call;
 *   exact Zod field names in submitted body; 403 message surfaced; onDone called on success.
 *
 * NOTE: afterEach(cleanup) is NOT declared here — global via apps/web/vitest.setup.ts.
 *
 * Mocking strategy: createSession action mocked via vi.mock (hoisted).
 * V3Sheet not used directly in the form — form renders inline (sheet wrapping is in session-list.tsx).
 * Assertion style: uses .toBeTruthy() / .toBeNull() / toHaveBeenCalledWith (no jest-dom).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionCreateForm } from './session-create-form';

// ─── Mock Server Action ───────────────────────────────────────────────────────
// IMPORTANT: vi.mock is hoisted — do NOT reference outer variables inside factory.

vi.mock('@/app/campanas/[id]/sessions/actions', () => ({
  createSession: vi.fn(),
}));

import { createSession } from '@/app/campanas/[id]/sessions/actions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockCreateSession = createSession as ReturnType<typeof vi.fn>;

function renderForm(onDone = vi.fn()) {
  return render(
    <SessionCreateForm campaignId="camp-1" onDone={onDone} />,
    { baseElement: document.body },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SessionCreateForm', () => {
  beforeEach(() => {
    mockCreateSession.mockReset();
  });

  // --- B2.3-T1: title required ---

  it('shows a title field that is required', () => {
    renderForm();
    const titleInput = screen.getByLabelText(/título/i);
    expect(titleInput).toBeTruthy();
  });

  it('shows error and does NOT call API when title is empty on submit', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // --- B2.3-T2: levelMin > levelMax blocked client-side WITHOUT an API call ---

  it('blocks submit when levelMin > levelMax and shows inline error without calling API', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Guardia del Norte' } });
    fireEvent.change(screen.getByLabelText(/nivel mínimo/i), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/nivel máximo/i), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/mínimo.*máximo|máximo.*mínimo/i);
    });

    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('allows submit when levelMin === levelMax', async () => {
    mockCreateSession.mockResolvedValueOnce({ ok: true, data: { id: 's-1' } });

    renderForm();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Nivel par' } });
    fireEvent.change(screen.getByLabelText(/nivel mínimo/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/nivel máximo/i), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledOnce();
    });
  });

  // --- B2.3-T3: exact Zod field names in submitted body ---

  it('submits body with exact Zod field names matching CreateSessionBody', async () => {
    mockCreateSession.mockResolvedValueOnce({ ok: true, data: { id: 's-1' } });

    renderForm();

    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Sesión de prueba' } });
    fireEvent.change(screen.getByLabelText(/nivel mínimo/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/nivel máximo/i), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText(/máximo de jugadores/i), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignId: 'camp-1',
          title: 'Sesión de prueba',
          levelMin: 3,
          levelMax: 7,
          maxPlayers: 5,
        }),
      );
    });
  });

  it('converts the datetime-local value to a full ISO 8601 datetime (API .datetime())', async () => {
    mockCreateSession.mockResolvedValueOnce({ ok: true, data: { id: 's-1' } });

    renderForm();

    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Sesión con fecha' } });
    fireEvent.change(screen.getByLabelText(/fecha y hora/i), { target: { value: '2026-06-05T20:50' } });

    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledOnce();
    });
    const sentBody = mockCreateSession.mock.calls[0]![0] as { scheduledAt?: string };
    // Must be a full ISO datetime (ends with Z), NOT the raw "2026-06-05T20:50".
    expect(sentBody.scheduledAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    expect(sentBody.scheduledAt).not.toBe('2026-06-05T20:50');
    // Round-trips to the same instant the user picked (local → UTC → Date).
    expect(new Date(sentBody.scheduledAt!).getTime()).toBe(new Date('2026-06-05T20:50').getTime());
  });

  it('omits optional numeric fields when blank (does not send empty string)', async () => {
    mockCreateSession.mockResolvedValueOnce({ ok: true, data: { id: 's-1' } });

    renderForm();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Solo título' } });
    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      const body = mockCreateSession.mock.calls[0][0] as Record<string, unknown>;
      expect(body.levelMin).toBeUndefined();
      expect(body.levelMax).toBeUndefined();
      expect(body.maxPlayers).toBeUndefined();
    });
  });

  // --- B2.3-T4: 403 FORBIDDEN message surfaced inline ---

  it('surfaces 403 forbidden error message inline', async () => {
    mockCreateSession.mockResolvedValueOnce({
      ok: false,
      error: 'Solo los DMs de este mundo pueden crear sesiones.',
      status: 403,
    });

    renderForm();
    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Sin permisos' } });
    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(/DM|permi/i);
    });
  });

  // --- B2.3-T5: onDone called on success ---

  it('calls onDone after successful create', async () => {
    mockCreateSession.mockResolvedValueOnce({ ok: true, data: { id: 's-new' } });

    const onDone = vi.fn();
    render(<SessionCreateForm campaignId="camp-1" onDone={onDone} />, {
      baseElement: document.body,
    });

    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Sesión exitosa' } });
    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledOnce();
    });
  });

  it('does NOT call onDone when API returns error', async () => {
    mockCreateSession.mockResolvedValueOnce({
      ok: false,
      error: 'Error de servidor',
    });

    const onDone = vi.fn();
    render(<SessionCreateForm campaignId="camp-1" onDone={onDone} />, {
      baseElement: document.body,
    });

    fireEvent.change(screen.getByLabelText(/título/i), { target: { value: 'Test error' } });
    fireEvent.click(screen.getByRole('button', { name: /crear sesión/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    expect(onDone).not.toHaveBeenCalled();
  });

  // --- Field presence ---

  it('renders all required and optional fields', () => {
    renderForm();
    expect(screen.getByLabelText(/título/i)).toBeTruthy();
    expect(screen.getByLabelText(/descripción/i)).toBeTruthy();
    expect(screen.getByLabelText(/notas del dm/i)).toBeTruthy();
    expect(screen.getByLabelText(/nivel mínimo/i)).toBeTruthy();
    expect(screen.getByLabelText(/nivel máximo/i)).toBeTruthy();
    expect(screen.getByLabelText(/máximo de jugadores/i)).toBeTruthy();
  });
});
