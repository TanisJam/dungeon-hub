/**
 * Tests for PoiMapDrawer (REQ-PML-DRAWER-01, REQ-PML-LIST-01, REQ-PML-LIST-02, REQ-PML-FLYTO-01).
 *
 * What is covered here (pure rendering — no useMap, no Leaflet map):
 *  - Renders one <li> per POI with name + status badge text.
 *  - Placed POI row is a <button>; clicking it calls onFlyTo with the correct poi.
 *  - Null-coord POI row shows "sin ubicación" hint and does NOT call onFlyTo on interaction.
 *  - open=false → panel has pointer-events-none class; close button calls onClose.
 *  - Empty pois=[] → "No hay puntos de interés" empty state.
 *
 * NOT tested here (Playwright E2E owns these):
 *  - Map flies to the clicked POI (requires Leaflet map instance).
 *  - Drawer open/close animation in the real browser.
 *  - Mobile vs desktop layout.
 *
 * Convention: afterEach(cleanup) is GLOBAL via vitest.setup.ts — do NOT re-add here.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PoiRow } from '@/app/mapa/actions';
import { PoiMapDrawer } from './poi-map-drawer';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makePoi(overrides: Partial<PoiRow> = {}): PoiRow {
  return {
    id: 'poi-1',
    worldId: 'world-1',
    hexId: 'hex-1',
    name: 'Dragon Cave',
    description: null,
    dmNotes: null,
    status: 'discovered',
    worldX: 100,
    worldY: 200,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const noop = vi.fn();

function renderDrawer(props: Partial<Parameters<typeof PoiMapDrawer>[0]> = {}) {
  const defaults = {
    pois: [makePoi()],
    effectiveView: 'dm' as const,
    open: true,
    onClose: vi.fn(),
    onFlyTo: vi.fn(),
  };
  return render(<PoiMapDrawer {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Task 3.1 RED / 3.2 GREEN — one <li> per POI with name + badge
// ---------------------------------------------------------------------------

describe('PoiMapDrawer — list rows', () => {
  it('renders one listitem per POI', () => {
    const pois = [
      makePoi({ id: 'a', name: 'Cave A' }),
      makePoi({ id: 'b', name: 'Cave B', status: 'cleared' }),
    ];
    renderDrawer({ pois });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders the POI name in each row', () => {
    renderDrawer({ pois: [makePoi({ name: 'Dragon Cave' })] });
    expect(screen.getByText('Dragon Cave')).toBeDefined();
  });

  it('renders the status badge using POI_STATUS_LABEL', () => {
    renderDrawer({ pois: [makePoi({ status: 'discovered' })] });
    expect(screen.getByText('Descubierto')).toBeDefined();
  });

  it('renders "Desconocido" badge for unknown status', () => {
    renderDrawer({ pois: [makePoi({ status: 'unknown' })] });
    expect(screen.getByText('Desconocido')).toBeDefined();
  });

  it('renders "Despejado" badge for cleared status', () => {
    renderDrawer({ pois: [makePoi({ status: 'cleared' })] });
    expect(screen.getByText('Despejado')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Task 3.3 RED / 3.4 GREEN — placed POI row is a button that calls onFlyTo
// ---------------------------------------------------------------------------

describe('PoiMapDrawer — placed POI row (worldX/worldY != null)', () => {
  it('placed POI row renders as a <button>', () => {
    const poi = makePoi({ worldX: 100, worldY: 200 });
    renderDrawer({ pois: [poi] });
    // The row is a button (in addition to the header close button)
    // We look for the one matching the POI name
    const btn = screen.getByRole('button', { name: /Dragon Cave/i });
    expect(btn).toBeDefined();
  });

  it('clicking a placed POI row calls onFlyTo with that POI', () => {
    const poi = makePoi({ id: 'poi-placed', worldX: 100, worldY: 200 });
    const onFlyTo = vi.fn();
    renderDrawer({ pois: [poi], onFlyTo });

    const btn = screen.getByRole('button', { name: /Dragon Cave/i });
    fireEvent.click(btn);

    expect(onFlyTo).toHaveBeenCalledOnce();
    expect(onFlyTo.mock.calls[0][0].id).toBe('poi-placed');
  });
});

// ---------------------------------------------------------------------------
// Task 3.5 RED / 3.6 GREEN — null-coord POI shows hint, no onFlyTo on click
// ---------------------------------------------------------------------------

describe('PoiMapDrawer — null-coord POI row (worldX == null)', () => {
  it('shows "sin ubicación" hint for null-coord POI', () => {
    const poi = makePoi({ id: 'poi-null', worldX: null, worldY: null });
    renderDrawer({ pois: [poi] });
    expect(screen.getByText('sin ubicación')).toBeDefined();
  });

  it('null-coord POI row has no interactive <button>', () => {
    const poi = makePoi({ id: 'poi-null', name: 'No Coord Cave', worldX: null, worldY: null });
    renderDrawer({ pois: [poi] });
    // The only buttons present are the close/handle buttons (header), not the row
    const allButtons = screen.getAllByRole('button');
    const rowButton = allButtons.find((b) => b.textContent?.includes('No Coord Cave'));
    expect(rowButton).toBeUndefined();
  });

  it('clicking a null-coord row does NOT call onFlyTo', () => {
    const poi = makePoi({ id: 'poi-null', worldX: null, worldY: null });
    const onFlyTo = vi.fn();
    renderDrawer({ pois: [poi], onFlyTo });
    // Click anywhere on the li — it's a div, no button, fireEvent.click won't reach onFlyTo
    const listitem = screen.getAllByRole('listitem')[0];
    fireEvent.click(listitem);
    expect(onFlyTo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Task 3.7 RED / 3.8 GREEN — open=false → pointer-events-none; close button fires onClose
// ---------------------------------------------------------------------------

describe('PoiMapDrawer — open/close state', () => {
  it('when open=false the panel has pointer-events-none class', () => {
    renderDrawer({ open: false });
    const panel = screen.getByTestId('poi-map-drawer');
    expect(panel.className).toContain('pointer-events-none');
  });

  it('when open=true the panel does NOT have pointer-events-none class', () => {
    renderDrawer({ open: true });
    const panel = screen.getByTestId('poi-map-drawer');
    expect(panel.className).not.toContain('pointer-events-none');
  });

  it('close button calls onClose when clicked', () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose });
    // The header close button has aria-label "Cerrar lista"
    const closeBtns = screen.getAllByLabelText('Cerrar lista');
    fireEvent.click(closeBtns[closeBtns.length - 1]); // click the × button (last one)
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Task 3.9 RED / 3.10 GREEN — empty pois=[] → "No hay puntos de interés"
// ---------------------------------------------------------------------------

describe('PoiMapDrawer — empty state', () => {
  it('renders "No hay puntos de interés" when pois is empty', () => {
    renderDrawer({ pois: [] });
    expect(screen.getByText('No hay puntos de interés')).toBeDefined();
  });

  it('renders no list items when pois is empty', () => {
    renderDrawer({ pois: [] });
    // Only the empty state <li> with the message
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('No hay puntos de interés');
  });
});
