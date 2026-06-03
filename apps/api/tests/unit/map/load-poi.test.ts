/**
 * Unit tests for filterWorldPoisForPlayer (pure helper — no DB, no HTTP).
 *
 * poi-world-level: extended to cover hybrid visibility model —
 *   - Hex-bound POIs (hexId set): hex-status cascade gate + POI-status gate.
 *   - Free-floating POIs (hexId null): POI-status gate only (no hex cascade).
 *
 * REQ-POI-CASCADE-01, REQ-POI-CASCADE-02 (spec #1687),
 * REQ-POIWL-VIS-01, REQ-POIWL-VIS-02 (spec #1710).
 */

import { describe, it, expect } from 'vitest';
import type { HexStatus } from '../../../src/use-cases/map/load-hex.js';
import type { LoadedPoiWithHexStatus } from '../../../src/use-cases/map/load-poi.js';
import {
  filterWorldPoisForPlayer,
  stripParentHexStatus,
} from '../../../src/use-cases/map/load-poi.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makePoi(
  overrides: Partial<LoadedPoiWithHexStatus> = {},
): LoadedPoiWithHexStatus {
  return {
    id: 'poi-1',
    hexId: 'hex-1',
    worldId: 'world-1',
    name: 'Test POI',
    description: null,
    dmNotes: null,
    status: 'discovered',
    worldX: null,
    worldY: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    parentHexStatus: 'explored' as HexStatus | null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// REQ-POI-CASCADE-01: Hex-status gate — unexplored parent hex → excluded
// ---------------------------------------------------------------------------

describe('filterWorldPoisForPlayer', () => {
  it('excludes a POI whose parent hex is unexplored (REQ-POI-CASCADE-01)', () => {
    const poi = makePoi({ status: 'discovered', parentHexStatus: 'unexplored' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(0);
  });

  it('includes a POI on a non-unexplored hex (REQ-POI-CASCADE-01)', () => {
    const poi = makePoi({ status: 'discovered', parentHexStatus: 'explored' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('poi-1');
  });

  it('includes a POI whose parent hex is rumored (REQ-POI-CASCADE-01)', () => {
    const poi = makePoi({ status: 'discovered', parentHexStatus: 'rumored' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
  });

  it('includes a POI whose parent hex is cleared (REQ-POI-CASCADE-01)', () => {
    const poi = makePoi({ status: 'discovered', parentHexStatus: 'cleared' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // REQ-POI-CASCADE-02: POI-status gate — status='unknown' → excluded for player
  // ---------------------------------------------------------------------------

  it('excludes a POI with status=unknown on a visible hex (REQ-POI-CASCADE-02)', () => {
    const poi = makePoi({ status: 'unknown', parentHexStatus: 'explored' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(0);
  });

  it('includes a POI with status=discovered on a visible hex (REQ-POI-CASCADE-02)', () => {
    const poi = makePoi({ status: 'discovered', parentHexStatus: 'explored' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
  });

  it('includes a POI with status=cleared on a visible hex (REQ-POI-CASCADE-02)', () => {
    const poi = makePoi({ status: 'cleared', parentHexStatus: 'rumored' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // REQ-POI-CASCADE-02: dmNotes stripped from player output
  // ---------------------------------------------------------------------------

  it('strips dmNotes from player output (REQ-POI-CASCADE-02)', () => {
    const poi = makePoi({
      status: 'discovered',
      parentHexStatus: 'explored',
      dmNotes: 'secret gm text',
    });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
    // dmNotes must be absent or null — must NOT be the original value
    expect((result[0] as { dmNotes?: string | null }).dmNotes).not.toBe('secret gm text');
  });

  // ---------------------------------------------------------------------------
  // parentHexStatus must NOT appear in player output (wire safety)
  // ---------------------------------------------------------------------------

  it('does not expose parentHexStatus in player output', () => {
    const poi = makePoi({ status: 'discovered', parentHexStatus: 'explored' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
    expect('parentHexStatus' in result[0]!).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Empty list passthrough
  // ---------------------------------------------------------------------------

  it('returns empty array when input is empty', () => {
    expect(filterWorldPoisForPlayer([])).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Mixed list: some included, some excluded
  // ---------------------------------------------------------------------------

  it('correctly filters a mixed list', () => {
    const pois: LoadedPoiWithHexStatus[] = [
      makePoi({ id: 'poi-a', status: 'discovered', parentHexStatus: 'explored' }),   // included
      makePoi({ id: 'poi-b', status: 'unknown', parentHexStatus: 'explored' }),       // excluded (status)
      makePoi({ id: 'poi-c', status: 'discovered', parentHexStatus: 'unexplored' }), // excluded (hex)
      makePoi({ id: 'poi-d', status: 'cleared', parentHexStatus: 'rumored' }),        // included
    ];
    const result = filterWorldPoisForPlayer(pois);
    expect(result).toHaveLength(2);
    const ids = result.map((p) => p.id);
    expect(ids).toContain('poi-a');
    expect(ids).toContain('poi-d');
    expect(ids).not.toContain('poi-b');
    expect(ids).not.toContain('poi-c');
  });

  // ---------------------------------------------------------------------------
  // REQ-POIWL-VIS-02: Free-floating POI hybrid visibility (poi-world-level)
  //
  // Free-floating POIs (hexId = null, parentHexStatus = null) skip the hex-status
  // cascade entirely. Only the POI-level status gate applies:
  //   status != 'unknown' → visible; status == 'unknown' → hidden.
  // ---------------------------------------------------------------------------

  it('includes a free-floating POI with status=discovered (REQ-POIWL-VIS-02)', () => {
    // FREE-FLOATING: hexId null, parentHexStatus null — no hex cascade.
    const poi = makePoi({ hexId: null, parentHexStatus: null, status: 'discovered' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('poi-1');
  });

  it('excludes a free-floating POI with status=unknown (REQ-POIWL-VIS-02)', () => {
    // FREE-FLOATING: hexId null, parentHexStatus null — only status gate.
    const poi = makePoi({ hexId: null, parentHexStatus: null, status: 'unknown' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(0);
  });

  it('includes a free-floating POI with status=cleared (REQ-POIWL-VIS-02)', () => {
    const poi = makePoi({ hexId: null, parentHexStatus: null, status: 'cleared' });
    const result = filterWorldPoisForPlayer([poi]);
    expect(result).toHaveLength(1);
  });

  it('mixed list including free-floating POIs (REQ-POIWL-VIS-01 + REQ-POIWL-VIS-02)', () => {
    const pois: LoadedPoiWithHexStatus[] = [
      makePoi({ id: 'hex-visible', hexId: 'h1', status: 'discovered', parentHexStatus: 'explored' }),    // included
      makePoi({ id: 'hex-unexplored', hexId: 'h2', status: 'discovered', parentHexStatus: 'unexplored' }), // excluded (hex cascade)
      makePoi({ id: 'float-discovered', hexId: null, parentHexStatus: null, status: 'discovered' }),     // included
      makePoi({ id: 'float-unknown', hexId: null, parentHexStatus: null, status: 'unknown' }),            // excluded (status gate)
    ];
    const result = filterWorldPoisForPlayer(pois);
    expect(result).toHaveLength(2);
    const ids = result.map((p) => p.id);
    expect(ids).toContain('hex-visible');
    expect(ids).toContain('float-discovered');
    expect(ids).not.toContain('hex-unexplored');
    expect(ids).not.toContain('float-unknown');
  });
});

// ---------------------------------------------------------------------------
// W-01: stripParentHexStatus — GM wire shape (W-01 closeout)
//
// The GM route branch does: raw.map(stripParentHexStatus) before returning.
// These tests assert the function's contract directly:
//   - parentHexStatus is removed (never reaches the wire)
//   - All other LoadedPoi fields (incl. dmNotes + unknown status) are preserved
//
// This ensures a future refactor that drops .map(stripParentHexStatus) from the
// GM branch will be caught immediately by a failing test rather than only by TS.
// ---------------------------------------------------------------------------

describe('stripParentHexStatus', () => {
  it('removes parentHexStatus from GM output (wire safety — W-01)', () => {
    const poi = makePoi({
      id: 'gm-poi-1',
      status: 'discovered',
      parentHexStatus: 'explored',
    });
    const result = stripParentHexStatus(poi);
    expect('parentHexStatus' in result).toBe(false);
  });

  it('preserves dmNotes in GM output (GM sees everything — W-01)', () => {
    const poi = makePoi({
      id: 'gm-poi-2',
      status: 'discovered',
      parentHexStatus: 'unexplored',
      dmNotes: 'secret dungeon entrance here',
    });
    const result = stripParentHexStatus(poi);
    expect(result.dmNotes).toBe('secret dungeon entrance here');
  });

  it('preserves status=unknown in GM output (GM sees all statuses — W-01)', () => {
    const poi = makePoi({
      id: 'gm-poi-3',
      status: 'unknown',
      parentHexStatus: 'unexplored',
    });
    const result = stripParentHexStatus(poi);
    // GM path does NOT filter by status — unknown POIs remain
    expect(result.status).toBe('unknown');
    expect('parentHexStatus' in result).toBe(false);
  });

  it('preserves all remaining LoadedPoi fields (W-01)', () => {
    const createdAt = new Date('2024-01-01T00:00:00Z');
    const updatedAt = new Date('2024-06-01T00:00:00Z');
    const poi = makePoi({
      id: 'gm-poi-4',
      hexId: 'hex-gm',
      name: 'Dragon Lair',
      description: 'A dark cave',
      dmNotes: 'BBEG hideout',
      status: 'cleared',
      worldX: 12.5,
      worldY: -7.3,
      createdAt,
      updatedAt,
      parentHexStatus: 'rumored',
    });
    const result = stripParentHexStatus(poi);
    expect(result.id).toBe('gm-poi-4');
    expect(result.hexId).toBe('hex-gm');
    expect(result.name).toBe('Dragon Lair');
    expect(result.description).toBe('A dark cave');
    expect(result.dmNotes).toBe('BBEG hideout');
    expect(result.status).toBe('cleared');
    expect(result.worldX).toBe(12.5);
    expect(result.worldY).toBe(-7.3);
    expect(result.createdAt).toBe(createdAt);
    expect(result.updatedAt).toBe(updatedAt);
    // parentHexStatus must be absent
    expect('parentHexStatus' in result).toBe(false);
  });
});
