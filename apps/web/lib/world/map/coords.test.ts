/**
 * coords.test.ts — pixel↔Leaflet lock for the CRS.Simple world map.
 *
 * REQ-WM-04: The pixel↔LatLng convention MUST be locked by unit test before any
 * marker depends on it. A silent mirror/scale bug on a map is invisible to visual
 * inspection — only a unit test catches it deterministically.
 *
 * Convention (from ADR-2 — standard deep-zoom pyramid, native res at MAX_ZOOM):
 *   - SCALE = 2^MAX_ZOOM = 32. Native resolution lands at zoom MAX_ZOOM (5).
 *   - worldToLatLng(x, y) = [-y / SCALE, x / SCALE]   (Y-flip via the negative sign)
 *   - latLngToWorld(lat, lng) = { worldX: lng * SCALE, worldY: -lat * SCALE }
 *
 * Corner assertions (canonical — keep in sync with the coords.ts comment):
 *   Image top-left  (0,     0)    → Leaflet [0,        0]
 *   Image bot-right (10200, 6600) → Leaflet [-206.25,  318.75]
 */

import { describe, it, expect } from 'vitest';
import { worldToLatLng, latLngToWorld, SCALE, IMAGE_W, IMAGE_H } from './coords';

const H = 6600; // image height
const W = 10200; // image width

describe('worldToLatLng — pixel→Leaflet (REQ-WM-04)', () => {
  it('SCALE is 2^MAX_ZOOM = 32 (native res at max zoom)', () => {
    expect(SCALE).toBe(32);
  });

  it('top-left pixel (0,0) maps to Leaflet [0, 0] — image top-left = map top-left', () => {
    expect(worldToLatLng(0, 0)).toEqual([0, 0]);
  });

  it('bottom-right pixel (W,H) maps to Leaflet [-H/SCALE, W/SCALE]', () => {
    expect(worldToLatLng(W, H)).toEqual([-H / SCALE, W / SCALE]); // [-206.25, 318.75]
  });

  it('center pixel maps to the bounds center', () => {
    expect(worldToLatLng(W / 2, H / 2)).toEqual([-H / 2 / SCALE, W / 2 / SCALE]); // [-103.125, 159.375]
  });

  it('top-right corner (W,0) maps to Leaflet [0, W/SCALE]', () => {
    expect(worldToLatLng(W, 0)).toEqual([0, W / SCALE]);
  });

  it('bottom-left corner (0,H) maps to Leaflet [-H/SCALE, 0] — top stays above bottom', () => {
    const [topLat] = worldToLatLng(0, 0);
    const [bottomLat] = worldToLatLng(0, H);
    expect(worldToLatLng(0, H)).toEqual([-H / SCALE, 0]);
    // No mirror: the image top must have a HIGHER latitude than the bottom.
    expect(topLat).toBeGreaterThan(bottomLat);
  });
});

describe('latLngToWorld — inverse transform', () => {
  it('round-trips top-left pixel', () => {
    const [lat, lng] = worldToLatLng(0, 0);
    expect(latLngToWorld(lat, lng)).toEqual({ worldX: 0, worldY: 0 });
  });

  it('round-trips bottom-right pixel', () => {
    const [lat, lng] = worldToLatLng(W, H);
    expect(latLngToWorld(lat, lng)).toEqual({ worldX: W, worldY: H });
  });

  it('round-trips an arbitrary internal pixel', () => {
    const worldX = 3400;
    const worldY = 2200;
    const [lat, lng] = worldToLatLng(worldX, worldY);
    expect(latLngToWorld(lat, lng)).toEqual({ worldX, worldY });
  });

  it('Leaflet [0,0] → worldX=0, worldY=0 (top-left)', () => {
    expect(latLngToWorld(0, 0)).toEqual({ worldX: 0, worldY: 0 });
  });

  it('Leaflet [-H/SCALE, W/SCALE] → worldX=W, worldY=H (bottom-right)', () => {
    expect(latLngToWorld(-H / SCALE, W / SCALE)).toEqual({ worldX: W, worldY: H });
  });
});

// ---------------------------------------------------------------------------
// Export-lock: IMAGE_W / IMAGE_H constants (REQ-PLACE-CONST-01)
//
// ORACLE NOTE: The W = 10200 / H = 6600 literals above are intentionally kept as
// independent oracle values so that a bug in coords.ts cannot make the transform
// tests pass by importing the same wrong constant. These two assertions below are
// the ONLY place IMAGE_W/IMAGE_H are imported — they lock the exported value
// against the source asset dimensions. They do NOT replace the local W/H oracle.
// ---------------------------------------------------------------------------

describe('IMAGE_W / IMAGE_H — export lock (REQ-PLACE-CONST-01)', () => {
  it('IMAGE_W matches the source asset width (10200 px)', () => {
    expect(IMAGE_W).toBe(10200);
  });

  it('IMAGE_H matches the source asset height (6600 px)', () => {
    expect(IMAGE_H).toBe(6600);
  });
});
