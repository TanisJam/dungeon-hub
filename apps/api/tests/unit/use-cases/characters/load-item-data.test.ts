import { describe, expect, it } from 'vitest';
import { RECHARGE_5ETOOLS_MAP } from '../../../../src/use-cases/characters/load-item-data.js';

/**
 * Unit tests for RECHARGE_5ETOOLS_MAP / extractRecharge mapping logic.
 *
 * PHB p.141 / 5etools alignment:
 * - `"restLong"` → `'long'`  (5etools for "recharges on long rest")
 * - `"restShort"` → `'short'` (defensive; mirrors restLong)
 * - `"dawn"` → `'dawn'`      (pass-through)
 * - Unknown → pass-through (domain recharge field allows string | null)
 *
 * REQ-R02-EXTRACT-RECHARGE-RESTLONG
 * REQ-R02-EXTRACT-RECHARGE-DAWN
 * REQ-R02-EXTRACT-RECHARGE-UNKNOWN
 */
describe('RECHARGE_5ETOOLS_MAP — 5etools → domain recharge mapping', () => {
  // REQ-R02-EXTRACT-RECHARGE-RESTLONG
  it('maps restLong → long (PHB p.141: recharges on long rest)', () => {
    expect(RECHARGE_5ETOOLS_MAP['restLong']).toBe('long');
  });

  // REQ-R02-EXTRACT-RECHARGE-DAWN
  it('maps dawn → dawn (no-op pass-through)', () => {
    expect(RECHARGE_5ETOOLS_MAP['dawn']).toBe('dawn');
  });

  // defensive mapping
  it('maps restShort → short', () => {
    expect(RECHARGE_5ETOOLS_MAP['restShort']).toBe('short');
  });

  // REQ-R02-EXTRACT-RECHARGE-UNKNOWN
  it('unknown value is NOT in the map (passes through unchanged via ?? r)', () => {
    // The map has no entry for 'midnight' — caller uses `?? r` fallback.
    expect(RECHARGE_5ETOOLS_MAP['midnight']).toBeUndefined();
  });
});
