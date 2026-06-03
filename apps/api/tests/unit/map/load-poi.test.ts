/**
 * Unit tests for filterWorldPoisForPlayer (pure helper — no DB, no HTTP).
 *
 * RED phase: these tests MUST fail before filterWorldPoisForPlayer is implemented.
 * GREEN phase: implement the function in load-poi.ts.
 *
 * REQ-POI-CASCADE-01, REQ-POI-CASCADE-02 (spec #1687).
 */

import { describe, it, expect } from 'vitest';
import type { HexStatus } from '../../../src/use-cases/map/load-hex.js';
import type { LoadedPoiWithHexStatus } from '../../../src/use-cases/map/load-poi.js';
import { filterWorldPoisForPlayer } from '../../../src/use-cases/map/load-poi.js';

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makePoi(
  overrides: Partial<LoadedPoiWithHexStatus> = {},
): LoadedPoiWithHexStatus {
  return {
    id: 'poi-1',
    hexId: 'hex-1',
    name: 'Test POI',
    description: null,
    dmNotes: null,
    status: 'discovered',
    worldX: null,
    worldY: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    parentHexStatus: 'explored' as HexStatus,
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
});
