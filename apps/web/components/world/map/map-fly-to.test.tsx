/**
 * Unit tests for MapFlyTo's focus-popup handling.
 *
 * feed-entity-tap-to-open (MVP #3.10) added `target.openPopup`, which defers
 * marker.openPopup() to a `map.once('moveend')` so the popup anchors at the
 * POI's post-fly position rather than under where it used to be.
 *
 * The listener therefore outlives the render that registered it, and the regression
 * these tests guard is what happens when a SECOND fly starts before the first one
 * lands: without deregistration the second fly's moveend fires the first fly's
 * handler, opening the previous POI's popup over the new location.
 *
 * The fake map models Leaflet's actual once/off semantics (register, remove,
 * fire-once) instead of asserting that `off` was called — a spy on `off` would
 * pass even if the handler it removed were the wrong one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import type L from 'leaflet';

// ---------------------------------------------------------------------------
// Fake Leaflet map — real once/off/fire semantics, no canvas
// ---------------------------------------------------------------------------

type Handler = () => void;

function createFakeMap() {
  const moveEndHandlers = new Set<Handler>();
  return {
    flyTo: vi.fn(),
    once: vi.fn((event: string, handler: Handler) => {
      if (event === 'moveend') moveEndHandlers.add(handler);
    }),
    off: vi.fn((event: string, handler: Handler) => {
      if (event === 'moveend') moveEndHandlers.delete(handler);
    }),
    /** Fire moveend the way Leaflet would: every live handler, `once` ones consumed. */
    fireMoveEnd() {
      const live = [...moveEndHandlers];
      moveEndHandlers.clear();
      live.forEach((h) => h());
    },
    get pendingMoveEndCount() {
      return moveEndHandlers.size;
    },
  };
}

let fakeMap: ReturnType<typeof createFakeMap>;

vi.mock('react-leaflet', () => ({
  useMap: () => fakeMap,
}));

vi.mock('@/lib/world/map/coords', () => ({
  worldToLatLng: (x: number, y: number) => [y, x],
}));

import { MapFlyTo } from './map-fly-to';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeMarker() {
  return { openPopup: vi.fn() } as unknown as L.Marker & { openPopup: ReturnType<typeof vi.fn> };
}

function refsFor(entries: Record<string, L.Marker>) {
  const ref = createRef<Map<string, L.Marker>>() as { current: Map<string, L.Marker> };
  ref.current = new Map(Object.entries(entries));
  return ref;
}

beforeEach(() => {
  fakeMap = createFakeMap();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MapFlyTo focus popup', () => {
  it('opens the focused POI popup only once the fly has landed', () => {
    const marker = fakeMarker();
    const refs = refsFor({ 'poi-a': marker });

    render(<MapFlyTo target={{ x: 1, y: 2, poiId: 'poi-a', openPopup: true }} markerRefs={refs} />);

    // Opening immediately would anchor the popup under the pre-fly position.
    expect(marker.openPopup).not.toHaveBeenCalled();
    expect(fakeMap.flyTo).toHaveBeenCalledTimes(1);

    fakeMap.fireMoveEnd();
    expect(marker.openPopup).toHaveBeenCalledTimes(1);
  });

  it('a second fly does not resurrect the first fly\'s popup', () => {
    const markerA = fakeMarker();
    const markerB = fakeMarker();
    const refs = refsFor({ 'poi-a': markerA, 'poi-b': markerB });

    const { rerender } = render(
      <MapFlyTo target={{ x: 1, y: 2, poiId: 'poi-a', openPopup: true }} markerRefs={refs} />,
    );

    // Tap a different POI before the first animation lands.
    rerender(<MapFlyTo target={{ x: 9, y: 9, poiId: 'poi-b', openPopup: true }} markerRefs={refs} />);

    fakeMap.fireMoveEnd();

    // Only B. A's stale handler must have been deregistered on effect re-run —
    // otherwise the map sits on B while A's popup is open.
    expect(markerB.openPopup).toHaveBeenCalledTimes(1);
    expect(markerA.openPopup).not.toHaveBeenCalled();
  });

  it('leaves no listener behind when it unmounts mid-fly', () => {
    const marker = fakeMarker();
    const refs = refsFor({ 'poi-a': marker });

    const { unmount } = render(
      <MapFlyTo target={{ x: 1, y: 2, poiId: 'poi-a', openPopup: true }} markerRefs={refs} />,
    );
    expect(fakeMap.pendingMoveEndCount).toBe(1);

    unmount();

    expect(fakeMap.pendingMoveEndCount).toBe(0);
    fakeMap.fireMoveEnd();
    expect(marker.openPopup).not.toHaveBeenCalled();
  });

  it('flies without opening anything when openPopup is not requested', () => {
    // The POI drawer's row taps fly without asking for a popup — unchanged behaviour.
    const marker = fakeMarker();
    const refs = refsFor({ 'poi-a': marker });

    render(<MapFlyTo target={{ x: 1, y: 2, poiId: 'poi-a' }} markerRefs={refs} />);

    expect(fakeMap.flyTo).toHaveBeenCalledTimes(1);
    expect(fakeMap.pendingMoveEndCount).toBe(0);
    fakeMap.fireMoveEnd();
    expect(marker.openPopup).not.toHaveBeenCalled();
  });

  it('degrades quietly when the focused POI has no marker on the map', () => {
    // A POI filtered out for this viewer (unknown status / unexplored hex) resolves
    // to no marker: fly, open nothing, never throw.
    const refs = refsFor({});

    expect(() =>
      render(<MapFlyTo target={{ x: 1, y: 2, poiId: 'missing', openPopup: true }} markerRefs={refs} />),
    ).not.toThrow();

    expect(fakeMap.flyTo).toHaveBeenCalledTimes(1);
    expect(fakeMap.pendingMoveEndCount).toBe(0);
  });

  it('does not fly on mount without a target', () => {
    render(<MapFlyTo target={null} />);
    expect(fakeMap.flyTo).not.toHaveBeenCalled();
  });
});
