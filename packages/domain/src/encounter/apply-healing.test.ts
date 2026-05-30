/**
 * Tests for applyHealing — pure HP clamp function.
 *
 * PHB p.197 — "Regaining Hit Points":
 *   "You can't regain hit points above your hit point maximum."
 *
 * RED-first: these tests were written before applyHealing implementation.
 * Design ref: sdd/engine-healing/design — ADR-1.
 */

import { describe, expect, it } from 'vitest';
import { applyHealing } from './apply-healing.js';

describe('applyHealing', () => {
  it(
    // REQ-H-01 — heal_below_max_full_gain
    'heal_below_max_full_gain: 10 HP + 5 heal (max 20) = 15 (PHB p.197)',
    () => {
      // PHB p.197: add healing to current HP; cannot exceed hpMax.
      expect(applyHealing(10, 5, 20)).toBe(15);
    },
  );

  it(
    // REQ-H-01 — heal_exceeding_max_clamps_to_hpMax
    'heal_exceeding_max_clamps_to_hpMax: 18 HP + 8 heal (max 20) = 20 (PHB p.197)',
    () => {
      // PHB p.197: "You can't regain hit points above your hit point maximum."
      expect(applyHealing(18, 8, 20)).toBe(20);
    },
  );

  it(
    // REQ-H-01 — already_at_max_no_op
    'already_at_max_no_op: 20 HP + 5 heal (max 20) = 20 (PHB p.197)',
    () => {
      // PHB p.197: already at max — healing has no effect on HP total.
      expect(applyHealing(20, 5, 20)).toBe(20);
    },
  );

  it(
    // REQ-H-01 / REQ-H-08 — heal_from_0_goes_positive
    'heal_from_0_goes_positive: 0 HP + 8 heal (max 20) = 8 (PHB p.197)',
    () => {
      // PHB p.197: creature at 0 HP regains HP equal to the heal amount (up to max).
      expect(applyHealing(0, 8, 20)).toBe(8);
    },
  );
});
