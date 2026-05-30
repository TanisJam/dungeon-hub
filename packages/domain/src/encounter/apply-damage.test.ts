/**
 * Tests for applyDamage — pure HP clamp function.
 *
 * PHB p.197 — "Damage and Healing":
 *   "Hit points can't go below 0."
 *
 * RED-first: these tests were written before applyDamage implementation.
 */

import { describe, expect, it } from 'vitest';
import { applyDamage } from './apply-damage.js';

describe('applyDamage', () => {
  it(
    // REQ-ATK-APPLY-01.1 — normal_damage_reduces_hp
    'normal_damage_reduces_hp: 20 HP − 7 damage = 13 (PHB p.197)',
    () => {
      // PHB p.197: subtract damage from hit points
      expect(applyDamage(20, 7)).toBe(13);
    },
  );

  it(
    // REQ-ATK-APPLY-01 — exact_hp_returns_zero
    'exact_hp_returns_zero: 10 HP − 10 damage = 0',
    () => {
      // PHB p.197: "Hit points can't go below 0."
      expect(applyDamage(10, 10)).toBe(0);
    },
  );

  it(
    // REQ-ATK-APPLY-01.2 — overkill_clamps_to_zero
    'overkill_clamps_to_zero: 3 HP − 50 damage = 0, never negative (PHB p.197)',
    () => {
      // PHB p.197: excess damage beyond 0 HP is discarded
      const result = applyDamage(3, 50);
      expect(result).toBe(0);
      expect(result).toBeGreaterThanOrEqual(0);
    },
  );
});
