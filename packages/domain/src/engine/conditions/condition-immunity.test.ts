/**
 * TDD tests for isImmuneToCondition — pure condition-immunity predicate.
 *
 * REQ-RI-12..17 / ADR-7
 *
 * PHB p.291 — Petrified:
 *   "The creature is immune to poison and disease, although a poison or disease
 *    already in its system is suspended, not neutralized."
 *
 * Specifically, a Petrified creature is immune to the POISONED *condition*
 * (not just poison damage). Applying the Poisoned condition to a Petrified
 * creature must be rejected.
 *
 * Data-driven immunity map: { Petrified: ['Poisoned'] }
 * TODO #513: move to DB-injected resolver when reference data migrates.
 *
 * Strict TDD — RED first.
 */
import { describe, it, expect } from 'vitest';
import { isImmuneToCondition } from './condition-immunity.js';

describe('isImmuneToCondition (REQ-RI-12..17 / ADR-7)', () => {
  // PHB p.291: Petrified creature is immune to the Poisoned condition

  it(
    'Petrified active + applying Poisoned → true (PHB p.291 — Petrified immune to Poisoned condition)',
    () => {
      // PHB p.291: "immune to poison and disease" includes the Poisoned condition
      expect(isImmuneToCondition([{ name: 'Petrified' }], 'Poisoned')).toBe(true);
    },
  );

  it(
    'no active conditions + applying Poisoned → false (no Petrified, no immunity)',
    () => {
      expect(isImmuneToCondition([], 'Poisoned')).toBe(false);
    },
  );

  it(
    'Petrified active + applying Blinded → false (Petrified does NOT grant immunity to Blinded)',
    () => {
      // PHB p.291: Petrified is immune to Poisoned and disease, NOT to Blinded
      expect(isImmuneToCondition([{ name: 'Petrified' }], 'Blinded')).toBe(false);
    },
  );

  it(
    'Petrified active + applying Stunned → false (Petrified does NOT grant immunity to Stunned)',
    () => {
      // PHB p.291: no immunity to Stunned listed
      expect(isImmuneToCondition([{ name: 'Petrified' }], 'Stunned')).toBe(false);
    },
  );

  it(
    'non-Petrified active (Stunned) + applying Poisoned → false (Stunned does not grant poison immunity)',
    () => {
      // Stunned is not in the immunity map
      expect(isImmuneToCondition([{ name: 'Stunned' }], 'Poisoned')).toBe(false);
    },
  );

  it(
    'multiple conditions including Petrified → true for Poisoned (immunity found)',
    () => {
      // Multiple conditions — Petrified is present among others
      expect(
        isImmuneToCondition(
          [{ name: 'Blinded' }, { name: 'Petrified' }, { name: 'Prone' }],
          'Poisoned',
        ),
      ).toBe(true);
    },
  );

  it(
    'Petrified active + applying Incapacitated → false (Petrified does not grant immunity to Incapacitated)',
    () => {
      // PHB p.291: Incapacitated is not in Petrified's immunity list
      expect(isImmuneToCondition([{ name: 'Petrified' }], 'Incapacitated')).toBe(false);
    },
  );
});
