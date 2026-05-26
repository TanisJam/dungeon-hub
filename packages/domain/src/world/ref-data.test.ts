/**
 * Tests for WorldRefData aggregate.
 * Covers REQ-DRD-AGGREGATE-SHAPE from sdd/domain-reference-data-runtime-source/spec.
 */
import { describe, expect, it } from 'vitest';
import { WorldRefDataSchema, type WorldRefData } from './ref-data.js';

describe('WorldRefDataSchema — aggregate shape', () => {
  it('accepts a well-formed object with all three fields', () => {
    const data: WorldRefData = {
      languagePool: {
        standard: ['common', 'dwarvish'],
        exotic: ['draconic'],
      },
      subraceRequiredSet: new Set(['dwarf|PHB']),
      subraceReplacingAbilitySet: new Set(['human--variant|PHB']),
    };
    const parsed = WorldRefDataSchema.safeParse(data);
    expect(parsed.success).toBe(true);
  });

  it('rejects an object missing languagePool', () => {
    const bad = {
      subraceRequiredSet: new Set<string>(),
      subraceReplacingAbilitySet: new Set<string>(),
    };
    const parsed = WorldRefDataSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it('rejects languagePool missing standard/exotic partitions', () => {
    const bad = {
      languagePool: { standard: ['common'] }, // missing exotic
      subraceRequiredSet: new Set<string>(),
      subraceReplacingAbilitySet: new Set<string>(),
    };
    const parsed = WorldRefDataSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });
});
