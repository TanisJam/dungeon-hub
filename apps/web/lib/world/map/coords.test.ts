/**
 * coords.test.ts — Y-axis lock for Leaflet CRS.Simple world map.
 *
 * REQ-WM-04: The Y-axis convention MUST be resolved and locked by unit test
 * before any marker depends on it. A silent mirror bug (Y-axis inversion) on a
 * symmetric-looking map is invisible to visual inspection — only a unit test
 * catches it deterministically.
 *
 * Convention (from ADR-2):
 *   - Tiles are generated Y-DOWN (row 0 = top of image, standard ImageMagick order).
 *   - Leaflet CRS.Simple has Y increasing UPWARD (origin at bottom-left).
 *   - The flip lives in worldToLatLng, NOT in `tms` flag or image preprocessing.
 *   - worldToLatLng(x, y) = [H - y, x]  where H = 6600 (image height in pixels)
 *   - latLngToWorld(lat, lng) = { worldX: lng, worldY: H - lat }
 *
 * Corner assertions (canonical — do not change without updating the coords.ts comment):
 *   Image top-left  (worldX=0,    worldY=0)    → Leaflet [6600, 0]      (lat=H, lng=0)
 *   Image bot-right (worldX=10200,worldY=6600) → Leaflet [0,    10200]  (lat=0, lng=W)
 */

import { describe, it, expect } from 'vitest';
import { worldToLatLng, latLngToWorld } from './coords';

const H = 6600; // image height
const W = 10200; // image width

describe('worldToLatLng — Y-axis flip (REQ-WM-04)', () => {
  it('top-left pixel (0,0) maps to Leaflet [H, 0] — image top = Leaflet max-lat', () => {
    // Image top-left: worldX=0, worldY=0
    // Leaflet CRS.Simple: lat = H - worldY = 6600; lng = worldX = 0
    // This ensures the image top-left renders at the visual top-left of the map.
    expect(worldToLatLng(0, 0)).toEqual([H, 0]);
  });

  it('bottom-right pixel (W,H) maps to Leaflet [0, W] — image bottom = Leaflet min-lat', () => {
    // Image bottom-right: worldX=10200, worldY=6600
    // Leaflet: lat = H - worldY = 0; lng = worldX = 10200
    expect(worldToLatLng(W, H)).toEqual([0, W]);
  });

  it('center pixel maps correctly', () => {
    // Center of a 10200×6600 image
    const cx = W / 2; // 5100
    const cy = H / 2; // 3300
    // lat = H - cy = 6600 - 3300 = 3300; lng = cx = 5100
    expect(worldToLatLng(cx, cy)).toEqual([3300, 5100]);
  });

  it('top-right corner maps to Leaflet [H, W]', () => {
    expect(worldToLatLng(W, 0)).toEqual([H, W]);
  });

  it('bottom-left corner maps to Leaflet [0, 0]', () => {
    expect(worldToLatLng(0, H)).toEqual([0, 0]);
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

  it('Leaflet [0,0] → worldX=0, worldY=H (bottom-left)', () => {
    // Leaflet lat=0, lng=0 → worldY = H - 0 = 6600; worldX = 0
    expect(latLngToWorld(0, 0)).toEqual({ worldX: 0, worldY: H });
  });

  it('Leaflet [H,W] → worldX=W, worldY=0 (top-right)', () => {
    expect(latLngToWorld(H, W)).toEqual({ worldX: W, worldY: 0 });
  });
});
