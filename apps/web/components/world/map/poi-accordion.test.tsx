/**
 * poi-accordion.test.tsx — component tests for POI coord fields + place-mode button.
 *
 * REQ-PLACE-FIELDS-01: DM coord inputs present/absent per role.
 * REQ-PLACE-TAP-01: "Colocar en mapa" button present/absent per role + coord state.
 *
 * afterEach(cleanup) is GLOBAL via vitest.setup.ts — do NOT re-add here.
 *
 * TDD Evidence (Strict mode — TASK-5.1):
 *   Tests authored before implementation was complete (Layer 5 follows Layer 4 per plan).
 *   Component exists; tests exercise new coord fields + button introduced in Layer 4.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PoiAccordion } from './poi-accordion';
import type { PoiRow, PoiBody } from '@/app/mapa/actions';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePoiRow(overrides: Partial<PoiRow> = {}): PoiRow {
  return {
    id: 'poi-1',
    worldId: 'world-1',
    hexId: 'hex-1',
    name: 'Test POI',
    description: null,
    dmNotes: null,
    status: 'discovered',
    worldX: null,
    worldY: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const NULL_COORD_POI = makePoiRow({ id: 'poi-null', worldX: null, worldY: null });
const PLACED_POI = makePoiRow({ id: 'poi-placed', worldX: 5000, worldY: 3300 });

/** Renders a pre-expanded PoiAccordion with the given POI list. */
async function renderExpandedAccordion({
  pois,
  effectiveView = 'dm' as 'dm' | 'player',
  onUpdatePoi = vi.fn().mockResolvedValue({ ok: true }),
  onCreatePoi = vi.fn().mockResolvedValue({ ok: true }),
  onDeletePoi = vi.fn().mockResolvedValue(undefined),
}: {
  pois: PoiRow[];
  effectiveView?: 'dm' | 'player';
  onUpdatePoi?: ReturnType<typeof vi.fn>;
  onCreatePoi?: ReturnType<typeof vi.fn>;
  onDeletePoi?: ReturnType<typeof vi.fn>;
}) {
  const onLoadPois = vi.fn().mockResolvedValue(pois);

  render(
    <PoiAccordion
      hexId="hex-test"
      effectiveView={effectiveView}
      onLoadPois={onLoadPois}
      onCreatePoi={onCreatePoi}
      onUpdatePoi={onUpdatePoi}
      onDeletePoi={onDeletePoi}
    />,
  );

  // Expand the accordion (triggers lazy load)
  const toggle = screen.getByRole('button', { name: /ver puntos de interés/i });
  await act(async () => {
    toggle.click();
  });

  return { onLoadPois, onUpdatePoi, onCreatePoi };
}

/** Opens the edit form for the first visible POI. */
async function openEditForm(poiName: string) {
  const editBtn = screen.getByRole('button', { name: new RegExp(`editar poi ${poiName}`, 'i') });
  await act(async () => {
    editBtn.click();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PoiAccordion — coord fields (REQ-PLACE-FIELDS-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('A: DM edit form renders Coord X input with min=0 max=10200', async () => {
    await renderExpandedAccordion({ pois: [NULL_COORD_POI], effectiveView: 'dm' });
    await openEditForm('Test POI');

    const xInput = screen.getByLabelText(/coord x/i) as HTMLInputElement;
    expect(xInput).toBeTruthy();
    expect(xInput.type).toBe('number');
    expect(xInput.min).toBe('0');
    expect(xInput.max).toBe('10200');
  });

  it('B: DM edit form renders Coord Y input with min=0 max=6600', async () => {
    await renderExpandedAccordion({ pois: [NULL_COORD_POI], effectiveView: 'dm' });
    await openEditForm('Test POI');

    const yInput = screen.getByLabelText(/coord y/i) as HTMLInputElement;
    expect(yInput).toBeTruthy();
    expect(yInput.type).toBe('number');
    expect(yInput.min).toBe('0');
    expect(yInput.max).toBe('6600');
  });

  it('C: Submitting with X=5000 Y=3300 passes worldX=5000, worldY=3300 to onUpdatePoi', async () => {
    const onUpdatePoi = vi.fn().mockResolvedValue({ ok: true });
    await renderExpandedAccordion({
      pois: [NULL_COORD_POI],
      effectiveView: 'dm',
      onUpdatePoi,
    });
    await openEditForm('Test POI');

    const xInput = screen.getByLabelText(/coord x/i) as HTMLInputElement;
    const yInput = screen.getByLabelText(/coord y/i) as HTMLInputElement;

    await act(async () => {
      // Simulate entering coord values
      Object.defineProperty(xInput, 'value', { writable: true, value: '5000' });
      xInput.dispatchEvent(new Event('change', { bubbles: true }));
      Object.defineProperty(yInput, 'value', { writable: true, value: '3300' });
      yInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Re-find inputs after re-render (act may have caused re-render)
    // Use React controlled input change event
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(screen.getByLabelText(/coord x/i), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/coord y/i), { target: { value: '3300' } });

    const submitBtn = screen.getByRole('button', { name: /guardar/i });
    await act(async () => {
      submitBtn.click();
    });

    expect(onUpdatePoi).toHaveBeenCalledWith(
      'poi-null',
      expect.objectContaining({ worldX: 5000, worldY: 3300 }),
    );
  });

  it('D: Submitting with both coord fields empty omits worldX/worldY from the call', async () => {
    const onUpdatePoi = vi.fn().mockResolvedValue({ ok: true });
    await renderExpandedAccordion({
      pois: [NULL_COORD_POI],
      effectiveView: 'dm',
      onUpdatePoi,
    });
    await openEditForm('Test POI');

    // Fields remain empty (default state)
    const submitBtn = screen.getByRole('button', { name: /guardar/i });
    await act(async () => {
      submitBtn.click();
    });

    const callArgs = onUpdatePoi.mock.calls[0]?.[1] as Partial<PoiBody>;
    expect(callArgs).toBeDefined();
    expect('worldX' in callArgs).toBe(false);
    expect('worldY' in callArgs).toBe(false);
  });

  it('E: Player view — Coord X / Coord Y inputs not in DOM', async () => {
    await renderExpandedAccordion({ pois: [NULL_COORD_POI], effectiveView: 'player' });

    // Player does not see a edit button, so form never opens — but confirm no coord inputs visible
    expect(screen.queryByLabelText(/coord x/i)).toBeNull();
    expect(screen.queryByLabelText(/coord y/i)).toBeNull();
  });
});

describe('PoiAccordion — Colocar en mapa button (REQ-PLACE-TAP-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('F: DM view, null-coord POI: "Colocar en mapa" button is in DOM', async () => {
    await renderExpandedAccordion({ pois: [NULL_COORD_POI], effectiveView: 'dm' });

    const btn = screen.getByRole('button', { name: /colocar test poi en el mapa/i });
    expect(btn).toBeTruthy();
  });

  it('G: DM view, placed POI (worldX non-null): "Colocar en mapa" button NOT in DOM', async () => {
    await renderExpandedAccordion({ pois: [PLACED_POI], effectiveView: 'dm' });

    const btn = screen.queryByRole('button', { name: /colocar.*en el mapa/i });
    expect(btn).toBeNull();
  });

  it('H: Player view, null-coord POI: "Colocar en mapa" button NOT in DOM', async () => {
    await renderExpandedAccordion({ pois: [NULL_COORD_POI], effectiveView: 'player' });

    const btn = screen.queryByRole('button', { name: /colocar.*en el mapa/i });
    expect(btn).toBeNull();
  });

  it('I: Clicking "Colocar en mapa" calls router.push with ?view=mapa&place=<id>', async () => {
    await renderExpandedAccordion({ pois: [NULL_COORD_POI], effectiveView: 'dm' });

    const btn = screen.getByRole('button', { name: /colocar test poi en el mapa/i });
    await act(async () => {
      btn.click();
    });

    expect(mockPush).toHaveBeenCalledWith(`?view=mapa&place=${NULL_COORD_POI.id}`);
  });
});

describe('PoiAccordion — edit form seeds coord values (REQ-PLACE-FIELDS-01)', () => {
  it('J: Opening edit on a placed POI seeds coord inputs with existing values', async () => {
    await renderExpandedAccordion({ pois: [PLACED_POI], effectiveView: 'dm' });
    await openEditForm('Test POI');

    const xInput = screen.getByLabelText(/coord x/i) as HTMLInputElement;
    const yInput = screen.getByLabelText(/coord y/i) as HTMLInputElement;

    expect(xInput.value).toBe('5000');
    expect(yInput.value).toBe('3300');
  });

  it('K: Opening create form seeds coord inputs as empty', async () => {
    await renderExpandedAccordion({ pois: [], effectiveView: 'dm' });

    const addBtn = screen.getByRole('button', { name: /añadir poi/i });
    await act(async () => {
      addBtn.click();
    });

    const xInput = screen.getByLabelText(/coord x/i) as HTMLInputElement;
    const yInput = screen.getByLabelText(/coord y/i) as HTMLInputElement;

    expect(xInput.value).toBe('');
    expect(yInput.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Round-trip edit test (REQ-PWC-FORM-01: accordion edit round-trip after extraction)
// ---------------------------------------------------------------------------

describe('PoiAccordion — edit round-trip after PoiForm extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('L: open edit → change name → submit → onUpdatePoi called with new name', async () => {
    const poi = makePoiRow({ id: 'poi-rt', name: 'Old Name' });
    const onUpdatePoi = vi.fn().mockResolvedValue({ ok: true });

    await renderExpandedAccordion({
      pois: [poi],
      effectiveView: 'dm',
      onUpdatePoi,
    });

    // Open the edit form
    await openEditForm('Old Name');

    // The name input should be seeded with the existing value
    const nameInput = screen.getByLabelText(/nombre/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Old Name');

    // Change the name
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(nameInput, { target: { value: 'New Name' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /guardar/i });
    await act(async () => {
      submitBtn.click();
    });

    // onUpdatePoi must have been called with the new name
    expect(onUpdatePoi).toHaveBeenCalledWith(
      'poi-rt',
      expect.objectContaining({ name: 'New Name' }),
    );
  });
});
