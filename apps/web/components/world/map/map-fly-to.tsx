'use client';

/**
 * MapFlyTo — a null-return child component mounted INSIDE <MapContainer>.
 *
 * Reads flyTarget from WorldMapLeaflet (lifted state) and calls map.flyTo()
 * via the react-leaflet useMap() hook, which is only available to children
 * of <MapContainer>.
 *
 * Design (ADR-2):
 *   - Mirrors the PlaceModeClickCatcher pattern but uses useMap() not useMapEvents().
 *   - Fresh flyTarget object per click → useEffect([target]) re-runs → re-fly works.
 *   - Do NOT add a value-equality guard (would break re-fly on same POI — ADR-2, REQ-PML-FLYTO-02).
 *   - Initial null guard: if (!target) return → no fly on mount (map uses its own center/zoom).
 *
 * REQ-PML-FLYTO-01, REQ-PML-FLYTO-02.
 */

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { worldToLatLng } from '@/lib/world/map/coords';

/** Fly-to zoom level — between INITIAL_ZOOM(1) and MAX_ZOOM(5); good "jumped to it" feel. */
const FLY_ZOOM = 3;

export interface FlyTarget {
  x: number;
  y: number;
  poiId: string;
}

interface MapFlyToProps {
  target: FlyTarget | null;
}

/**
 * MapFlyTo — MUST be a descendant of <MapContainer> to access the Leaflet map instance.
 * Returns null (no DOM output). Fires map.flyTo() when target changes.
 */
export function MapFlyTo({ target }: MapFlyToProps) {
  const map = useMap();

  useEffect(() => {
    if (!target) return; // guard initial null — do not fly on mount
    map.flyTo(worldToLatLng(target.x, target.y), FLY_ZOOM);
    // target is a FRESH OBJECT per click → this effect re-runs → re-fly works.
    // Do NOT add a value-equality guard — it would silently break REQ-PML-FLYTO-02.
  }, [target, map]);

  return null;
}
