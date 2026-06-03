/**
 * Unit tests for CreatePoiBody / UpdatePoiBody Zod bounds on worldX/worldY.
 *
 * RED phase: these tests MUST fail before .min(0).max() constraints are added
 * to CreatePoiBody / UpdatePoiBody in apps/api/src/http/routes/map.ts.
 * GREEN phase: add .min(0).max(10200) to worldX and .min(0).max(6600) to worldY.
 *
 * REQ-PLACE-BOUNDS-01 (spec #1697): Out-of-range coords → rejected at parse level.
 * Bounds: worldX in [0..10200], worldY in [0..6600] — map asset pixel dimensions
 * matching IMAGE_W/IMAGE_H in apps/web/lib/world/map/coords.ts.
 *
 * Parse-level test: no DB, no HTTP — fast and isolated.
 * Schemas are imported from the production route file (exported for testability).
 */

import { describe, it, expect } from 'vitest';
import { CreatePoiBody, UpdatePoiBody } from '../../../src/http/routes/map.js';

// ---------------------------------------------------------------------------
// CreatePoiBody — worldX bounds [0..10200]
// REQ-PLACE-BOUNDS-01
// ---------------------------------------------------------------------------

describe('CreatePoiBody — worldX bounds [0..10200]', () => {
  it('rejects worldX = -1 (below lower bound)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldX: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects worldX = 10201 (above upper bound)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldX: 10201 });
    expect(result.success).toBe(false);
  });

  it('accepts worldX = 0 (lower boundary)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldX: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts worldX = 10200 (upper boundary)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldX: 10200 });
    expect(result.success).toBe(true);
  });

  it('accepts worldX = null (clear coord)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldX: null });
    expect(result.success).toBe(true);
  });

  it('accepts omitted worldX (leave unchanged)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreatePoiBody — worldY bounds [0..6600]
// REQ-PLACE-BOUNDS-01
// ---------------------------------------------------------------------------

describe('CreatePoiBody — worldY bounds [0..6600]', () => {
  it('rejects worldY = -1 (below lower bound)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldY: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects worldY = 6601 (above upper bound)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldY: 6601 });
    expect(result.success).toBe(false);
  });

  it('accepts worldY = 0 (lower boundary)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldY: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts worldY = 6600 (upper boundary)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldY: 6600 });
    expect(result.success).toBe(true);
  });

  it('accepts worldY = null (clear coord)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test', worldY: null });
    expect(result.success).toBe(true);
  });

  it('accepts omitted worldY (leave unchanged)', () => {
    const result = CreatePoiBody.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UpdatePoiBody — worldX bounds [0..10200]
// REQ-PLACE-BOUNDS-01
// ---------------------------------------------------------------------------

describe('UpdatePoiBody — worldX bounds [0..10200]', () => {
  it('rejects worldX = -1 (below lower bound)', () => {
    const result = UpdatePoiBody.safeParse({ worldX: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects worldX = 10201 (above upper bound)', () => {
    const result = UpdatePoiBody.safeParse({ worldX: 10201 });
    expect(result.success).toBe(false);
  });

  it('accepts worldX = 0 (lower boundary)', () => {
    const result = UpdatePoiBody.safeParse({ worldX: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts worldX = 10200 (upper boundary)', () => {
    const result = UpdatePoiBody.safeParse({ worldX: 10200 });
    expect(result.success).toBe(true);
  });

  it('accepts worldX = null (clear coord)', () => {
    const result = UpdatePoiBody.safeParse({ worldX: null });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UpdatePoiBody — worldY bounds [0..6600]
// REQ-PLACE-BOUNDS-01
// ---------------------------------------------------------------------------

describe('UpdatePoiBody — worldY bounds [0..6600]', () => {
  it('rejects worldY = -1 (below lower bound)', () => {
    const result = UpdatePoiBody.safeParse({ worldY: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects worldY = 6601 (above upper bound)', () => {
    const result = UpdatePoiBody.safeParse({ worldY: 6601 });
    expect(result.success).toBe(false);
  });

  it('accepts worldY = 0 (lower boundary)', () => {
    const result = UpdatePoiBody.safeParse({ worldY: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts worldY = 6600 (upper boundary)', () => {
    const result = UpdatePoiBody.safeParse({ worldY: 6600 });
    expect(result.success).toBe(true);
  });

  it('accepts worldY = null (clear coord)', () => {
    const result = UpdatePoiBody.safeParse({ worldY: null });
    expect(result.success).toBe(true);
  });
});
