/**
 * poi-form.test.tsx — component tests for the extracted PoiForm.
 *
 * REQ-PWC-FORM-01: shared form for create and edit modes.
 *
 * afterEach(cleanup) is GLOBAL via vitest.setup.ts — do NOT re-add here.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PoiForm } from './poi-form';
import type { PoiRow, PoiBody } from '@/app/mapa/actions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePoiRow(overrides: Partial<PoiRow> = {}): PoiRow {
  return {
    id: 'poi-1',
    worldId: 'world-1',
    hexId: 'hex-1',
    name: 'Existing POI',
    description: 'Some desc',
    dmNotes: 'DM secret',
    status: 'discovered',
    worldX: 5000,
    worldY: 3300,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: create mode
// ---------------------------------------------------------------------------

describe('PoiForm — create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A: mode=create with initialCoords pre-fills worldX and worldY', () => {
    render(
      <PoiForm
        mode="create"
        initial={null}
        initialCoords={{ worldX: 300, worldY: 450 }}
        onSubmit={vi.fn()}
        onDone={vi.fn()}
        idPrefix="test"
      />,
    );

    const xInput = screen.getByLabelText(/coord x/i) as HTMLInputElement;
    const yInput = screen.getByLabelText(/coord y/i) as HTMLInputElement;

    expect(xInput.value).toBe('300');
    expect(yInput.value).toBe('450');
  });

  it('B: pre-filled coord fields are still editable', () => {
    render(
      <PoiForm
        mode="create"
        initial={null}
        initialCoords={{ worldX: 300, worldY: 450 }}
        onSubmit={vi.fn()}
        onDone={vi.fn()}
        idPrefix="test"
      />,
    );

    const xInput = screen.getByLabelText(/coord x/i) as HTMLInputElement;
    fireEvent.change(xInput, { target: { value: '999' } });
    expect(xInput.value).toBe('999');
  });

  it('C: submit in create mode calls onSubmit with correct body mapping', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onDone = vi.fn();

    render(
      <PoiForm
        mode="create"
        initial={null}
        initialCoords={{ worldX: 300, worldY: 450 }}
        onSubmit={onSubmit}
        onDone={onDone}
        idPrefix="test"
      />,
    );

    // Fill name (required)
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Fortaleza' } });
    // Change status
    fireEvent.change(screen.getByLabelText(/estado/i), { target: { value: 'discovered' } });

    const submitBtn = screen.getByRole('button', { name: /crear poi/i });
    await act(async () => {
      submitBtn.click();
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining<Partial<PoiBody>>({
        name: 'Fortaleza',
        status: 'discovered',
        worldX: 300,
        worldY: 450,
      }),
    );
  });

  it('D: submit success calls onDone', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onDone = vi.fn();

    render(
      <PoiForm
        mode="create"
        initial={null}
        onSubmit={onSubmit}
        onDone={onDone}
        idPrefix="test"
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'New POI' } });
    const submitBtn = screen.getByRole('button', { name: /crear poi/i });
    await act(async () => {
      submitBtn.click();
    });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('E: submit failure shows formError, onDone NOT called', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: 'API error' });
    const onDone = vi.fn();

    render(
      <PoiForm
        mode="create"
        initial={null}
        onSubmit={onSubmit}
        onDone={onDone}
        idPrefix="test"
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Bad POI' } });
    const submitBtn = screen.getByRole('button', { name: /crear poi/i });
    await act(async () => {
      submitBtn.click();
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('API error');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('F: empty coord fields are omitted from onSubmit body', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });

    render(
      <PoiForm
        mode="create"
        initial={null}
        onSubmit={onSubmit}
        onDone={vi.fn()}
        idPrefix="test"
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'No Coords' } });
    const submitBtn = screen.getByRole('button', { name: /crear poi/i });
    await act(async () => {
      submitBtn.click();
    });

    const body = onSubmit.mock.calls[0]?.[0] as Partial<PoiBody>;
    expect('worldX' in body).toBe(false);
    expect('worldY' in body).toBe(false);
  });

  it('G: Cancelar button calls onDone without calling onSubmit', async () => {
    const onSubmit = vi.fn();
    const onDone = vi.fn();

    render(
      <PoiForm
        mode="create"
        initial={null}
        onSubmit={onSubmit}
        onDone={onDone}
        idPrefix="test"
      />,
    );

    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
    await act(async () => {
      cancelBtn.click();
    });

    expect(onDone).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: edit mode
// ---------------------------------------------------------------------------

describe('PoiForm — edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('H: mode=edit seeds all fields from the initial row', () => {
    const poi = makePoiRow();

    render(
      <PoiForm
        mode="edit"
        initial={poi}
        onSubmit={vi.fn()}
        onDone={vi.fn()}
        idPrefix="test"
      />,
    );

    expect((screen.getByLabelText(/nombre/i) as HTMLInputElement).value).toBe('Existing POI');
    expect((screen.getByLabelText(/coord x/i) as HTMLInputElement).value).toBe('5000');
    expect((screen.getByLabelText(/coord y/i) as HTMLInputElement).value).toBe('3300');
    expect((screen.getByLabelText(/estado/i) as HTMLSelectElement).value).toBe('discovered');
  });

  it('I: edit mode submit calls onSubmit with updated values', async () => {
    const poi = makePoiRow();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const onDone = vi.fn();

    render(
      <PoiForm
        mode="edit"
        initial={poi}
        onSubmit={onSubmit}
        onDone={onDone}
        idPrefix="test"
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Updated Name' } });
    const submitBtn = screen.getByRole('button', { name: /guardar/i });
    await act(async () => {
      submitBtn.click();
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining<Partial<PoiBody>>({
        name: 'Updated Name',
      }),
    );
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('J: submit button shows "Guardar" in edit mode, "Crear POI" in create mode', () => {
    const { unmount } = render(
      <PoiForm mode="edit" initial={makePoiRow()} onSubmit={vi.fn()} onDone={vi.fn()} idPrefix="test" />,
    );
    expect(screen.queryByRole('button', { name: /guardar/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /crear poi/i })).toBeNull();
    unmount();

    render(
      <PoiForm mode="create" initial={null} onSubmit={vi.fn()} onDone={vi.fn()} idPrefix="test2" />,
    );
    expect(screen.queryByRole('button', { name: /crear poi/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /guardar/i })).toBeNull();
  });
});
