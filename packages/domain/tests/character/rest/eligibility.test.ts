import { describe, expect, it } from 'vitest';
import { validateLongRestEligibility } from '../../../src/character/rest/eligibility.js';

/**
 * PHB p.186 — Long Rest: "A character must have at least 1 hit point at the
 * start of the rest to gain its benefits."
 * Temp HP (PHB p.198) is excluded — gate checks hp.current only.
 */
describe('validateLongRestEligibility', () => {
  // REQ-R02-VALIDATE-LONG-REST-OK
  it('returns ok:true for a character with hp >= 1 (alive)', () => {
    // PHB p.186: hp=5 >= 1 → eligible for long rest
    const result = validateLongRestEligibility(5);
    expect(result.ok).toBe(true);
  });

  // REQ-R02-VALIDATE-LONG-REST-OK — boundary at exactly 1 HP
  it('returns ok:true for a character at exactly 1 HP (boundary)', () => {
    // PHB p.186: "at least 1 hit point" → hp=1 is the minimum valid value
    const result = validateLongRestEligibility(1);
    expect(result.ok).toBe(true);
  });

  // REQ-R02-VALIDATE-LONG-REST-DOWNED — 0 HP
  it('returns ok:false with LONG_REST_DOWNED for a downed character (hp=0)', () => {
    // PHB p.186: hp=0 means downed — cannot benefit from long rest
    const result = validateLongRestEligibility(0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toEqual({
      code: 'LONG_REST_DOWNED',
      expected: 1,
      got: 0,
    });
  });

  // REQ-R02-VALIDATE-LONG-REST-DOWNED — negative HP
  it('returns ok:false with LONG_REST_DOWNED for negative HP', () => {
    // PHB p.186: hp <= 0 — still downed regardless of how negative
    const result = validateLongRestEligibility(-3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toEqual({
      code: 'LONG_REST_DOWNED',
      expected: 1,
      got: -3,
    });
  });

  // REQ-R02-VALIDATE-LONG-REST-NULL — uninitialized HP
  it('returns ok:true for null HP (uninitialized character)', () => {
    // Uninitialized HP (null) defers to the route-level auto-init path.
    // Read-path tolerance: legacy characters without hp.current must still be
    // able to long rest — the route bootstraps HP max on the same call.
    const result = validateLongRestEligibility(null);
    expect(result.ok).toBe(true);
  });
});
