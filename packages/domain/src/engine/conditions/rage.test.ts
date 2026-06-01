/**
 * TDD tests for isRaging predicate (A-1).
 *
 * PHB p.48 — Rage:
 *   While raging, a barbarian gains rage benefits.
 *   The 'Raging' condition is self-applied via activate-rage use-case.
 *
 * REQ-RAGE-06, REQ-RAGE-08, REQ-RAGE-09, REQ-RAGE-04
 *
 * Strict TDD — RED first.
 */

import { describe, expect, it } from 'vitest';
import { isRaging } from './rage.js';

describe('isRaging (REQ-RAGE-06, PHB p.48)', () => {
  it('empty condition set → false (PHB p.48 — no Raging condition)', () => {
    // PHB p.48: Rage is only active when the 'Raging' condition is present
    expect(isRaging([])).toBe(false);
  });

  it('set containing Raging → true (REQ-RAGE-06 — Raging condition present)', () => {
    // PHB p.48: barbarian is raging iff the 'Raging' condition is in their condition set
    expect(isRaging([{ name: 'Raging' }])).toBe(true);
  });

  it('set containing only Prone → false (non-Raging condition)', () => {
    // Case-sensitive: 'Raging' only; other conditions do not trigger isRaging
    expect(isRaging([{ name: 'Prone' }])).toBe(false);
  });

  it('multi-condition set including Raging → true (REQ-RAGE-06, PHB p.48)', () => {
    // Multiple conditions: isRaging fires iff at least one has name === 'Raging'
    expect(isRaging([{ name: 'Prone' }, { name: 'Raging' }])).toBe(true);
  });

  it('case-sensitive: "raging" (lowercase) → false (PHB p.48 — condition name is "Raging")', () => {
    // Condition name is 'Raging' (capitalised) per the catalog convention
    expect(isRaging([{ name: 'raging' }])).toBe(false);
  });
});
