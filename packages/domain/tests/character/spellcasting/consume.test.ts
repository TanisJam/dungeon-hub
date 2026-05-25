/**
 * Tests for consumeSpellSlot — pure domain function.
 * PHB p.201 — "you expend a spell slot to cast a spell of that level or higher."
 * PHB p.107 — Warlock Pact Magic: separate pool, single slot level, recovers on short rest.
 * PHB p.164 — Multiclass: regular slots merge; pact magic tracked independently.
 */
import { describe, expect, it } from 'vitest';
import { consumeSpellSlot } from '../../../src/character/spellcasting/consume.js';
import type { SlotConsumptionInput } from '../../../src/character/spellcasting/types.js';
import { NO_SLOTS } from '../../../src/character/spellcasting/types.js';
import type { PactMagic } from '../../../src/character/spellcasting/types.js';

const WARLOCK5_PACT: PactMagic = { slotLevel: 3, slotCount: 2 };

function makeInput(overrides: Partial<SlotConsumptionInput> = {}): SlotConsumptionInput {
  return {
    slotsMax: [4, 3, 2, 1, 0, 0, 0, 0, 0],
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactMagic: null,
    pactSlotsUsed: 0,
    level: 1,
    slotType: 'regular',
    ...overrides,
  };
}

describe('consumeSpellSlot — level guard', () => {
  it('rejects level 0 → SLOT_LEVEL_OUT_OF_RANGE (PHB p.201 — levels 1-9 only)', () => {
    // PHB p.201 — spell slots exist only at levels 1–9.
    const result = consumeSpellSlot(makeInput({ level: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe('SLOT_LEVEL_OUT_OF_RANGE');
    }
  });

  it('rejects level 10 → SLOT_LEVEL_OUT_OF_RANGE', () => {
    const result = consumeSpellSlot(makeInput({ level: 10 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe('SLOT_LEVEL_OUT_OF_RANGE');
    }
  });

  it('rejects level -1 → SLOT_LEVEL_OUT_OF_RANGE', () => {
    const result = consumeSpellSlot(makeInput({ level: -1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe('SLOT_LEVEL_OUT_OF_RANGE');
    }
  });
});

describe('consumeSpellSlot — regular slots', () => {
  it('happy path L1: increments slotsUsed[0]', () => {
    // PHB p.201 — expend a slot of the spell's level or higher.
    const result = consumeSpellSlot(makeInput({ level: 1, slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0] }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slotsUsed[0]).toBe(1);
      expect(result.pactSlotsUsed).toBe(0);
    }
  });

  it('happy path L5: increments slotsUsed[4]', () => {
    const result = consumeSpellSlot(makeInput({
      level: 5,
      slotsMax: [4, 3, 2, 1, 2, 0, 0, 0, 0],
      slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slotsUsed[4]).toBe(1);
    }
  });

  it('rejects when slot not available (max=2, used=2) → SLOT_NOT_AVAILABLE with count fields', () => {
    // PHB p.201 — cannot expend a slot you don't have.
    const result = consumeSpellSlot(makeInput({
      level: 1,
      slotsMax: [2, 0, 0, 0, 0, 0, 0, 0, 0],
      slotsUsed: [2, 0, 0, 0, 0, 0, 0, 0, 0],
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues[0];
      expect(issue?.code).toBe('SLOT_NOT_AVAILABLE');
      if (issue?.code === 'SLOT_NOT_AVAILABLE') {
        // engram #556: count-mismatch uses expectedCount/gotCount
        expect(issue.expectedCount).toBe(1);
        expect(issue.gotCount).toBe(0);
        expect(issue.level).toBe(1);
        expect(issue.slotType).toBe('regular');
      }
    }
  });

  it('rejects when max = 0 for that level (non-caster)', () => {
    const result = consumeSpellSlot(makeInput({
      level: 3,
      slotsMax: NO_SLOTS,
      slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe('SLOT_NOT_AVAILABLE');
    }
  });
});

describe('consumeSpellSlot — pact magic', () => {
  it('rejects pact for non-warlock (pactMagic=null) → NO_PACT_MAGIC', () => {
    // PHB p.107 — pact magic is exclusive to warlocks.
    const result = consumeSpellSlot(makeInput({ slotType: 'pact', pactMagic: null, level: 3 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe('NO_PACT_MAGIC');
    }
  });

  it('rejects pact at wrong level → PACT_LEVEL_MISMATCH (expected/got per engram #556)', () => {
    // PHB p.107 — pact slots exist only at the warlock's single pact level.
    const result = consumeSpellSlot(makeInput({
      slotType: 'pact',
      pactMagic: WARLOCK5_PACT,
      level: 2,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues[0];
      expect(issue?.code).toBe('PACT_LEVEL_MISMATCH');
      if (issue?.code === 'PACT_LEVEL_MISMATCH') {
        expect(issue.expected).toBe(3);
        expect(issue.got).toBe(2);
      }
    }
  });

  it('rejects when all pact slots spent → SLOT_NOT_AVAILABLE', () => {
    const result = consumeSpellSlot(makeInput({
      slotType: 'pact',
      pactMagic: WARLOCK5_PACT,
      pactSlotsUsed: 2,
      level: 3,
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues[0];
      expect(issue?.code).toBe('SLOT_NOT_AVAILABLE');
      if (issue?.code === 'SLOT_NOT_AVAILABLE') {
        expect(issue.slotType).toBe('pact');
      }
    }
  });

  it('happy path pact: increments pactSlotsUsed, slotsUsed unchanged', () => {
    // PHB p.107 — consume a pact slot.
    const result = consumeSpellSlot(makeInput({
      slotType: 'pact',
      pactMagic: WARLOCK5_PACT,
      pactSlotsUsed: 0,
      level: 3,
    }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pactSlotsUsed).toBe(1);
      // slotsUsed must be unchanged
      expect(result.slotsUsed[2]).toBe(0);
    }
  });
});

describe('consumeSpellSlot — multiclass independence', () => {
  // PHB p.107 + p.164 — multiclass merges regular slots but pact magic is tracked independently.
  const MULTICLASS_INPUT = makeInput({
    slotsMax: [0, 0, 4, 3, 2, 1, 1, 0, 0],
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    pactMagic: WARLOCK5_PACT,
    pactSlotsUsed: 0,
    level: 3,
  });

  it('consume regular → pactSlotsUsed unchanged', () => {
    const result = consumeSpellSlot({ ...MULTICLASS_INPUT, slotType: 'regular' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slotsUsed[2]).toBe(1);
      expect(result.pactSlotsUsed).toBe(0);
    }
  });

  it('consume pact → slotsUsed unchanged', () => {
    const result = consumeSpellSlot({
      ...MULTICLASS_INPUT,
      slotsUsed: [0, 0, 1, 0, 0, 0, 0, 0, 0],
      slotType: 'pact',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pactSlotsUsed).toBe(1);
      expect(result.slotsUsed[2]).toBe(1); // unchanged from input
    }
  });
});
