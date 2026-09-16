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
 * feed-entity-tap-to-open (MVP #3.10): target.openPopup lets a caller (the ?poi=
 * deep-link focus effect in WorldMapLeaflet) ask for the marker's popup to open once
 * the fly finishes — `map.once('moveend', ...)` waits out the flyTo animation instead
 * of opening the popup immediately underneath it. Requires `markerRefs` — the Map<id,
 * Marker> WorldMapLeaflet fills via each <Marker ref>. Omit either and no popup opens
 * (PoiMapDrawer's onFlyTo calls never set openPopup, so their behavior is unchanged).
 *
 * REQ-PML-FLYTO-01, REQ-PML-FLYTO-02.
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useMap } from 'react-leaflet';
import type L from 'leaflet';
import { worldToLatLng } from '@/lib/world/map/coords';

/** Fly-to zoom level — closer "jumped to it" feel (map maxZoom is 6). */
const FLY_ZOOM = 4;

export interface FlyTarget {
  x: number;
  y: number;
  poiId: string;
  /** feed-entity-tap-to-open: open this POI's popup once the fly-to animation ends. */
  openPopup?: boolean;
}

interface MapFlyToProps {
  target: FlyTarget | null;
  /** Marker instances keyed by POI id — required to resolve target.openPopup. */
  markerRefs?: RefObject<Map<string, L.Marker>>;
}

/**
 * MapFlyTo — MUST be a descendant of <MapContainer> to access the Leaflet map instance.
 * Returns null (no DOM output). Fires map.flyTo() when target changes.
 */
export function MapFlyTo({ target, markerRefs }: MapFlyToProps) {
  const map = useMap();

  useEffect(() => {
    if (!target) return; // guard initial null — do not fly on mount
    map.flyTo(worldToLatLng(target.x, target.y), FLY_ZOOM);
    // target is a FRESH OBJECT per click → this effect re-runs → re-fly works.
    // Do NOT add a value-equality guard — it would silently break REQ-PML-FLYTO-02.

    if (target.openPopup) {
      const marker = markerRefs?.current.get(target.poiId);
      if (marker) {
        // Wait for the flyTo animation to finish before opening — opening immediately
        // would anchor the popup under the marker's PRE-fly position.
        const openOnArrival = () => marker.openPopup();
        map.once('moveend', openOnArrival);
        // Deregister on re-run/unmount. Without this the listener outlives its fly:
        // tap another POI mid-animation and the SECOND fly's moveend fires the FIRST
        // one's handler, opening the previous POI's popup over the new location.
        return () => {
          map.off('moveend', openOnArrival);
        };
      }
    }

    return undefined;
  }, [target, map, markerRefs]);

  return null;
}
