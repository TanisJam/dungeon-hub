/**
 * consumeSpellSlot — pure domain function.
 * PHB p.201 — "you expend a spell slot to cast a spell of that level or higher."
 * PHB p.107 — Warlock Pact Magic: tracked separately from regular slots.
 */
import type { SlotConsumptionInput, SlotConsumptionResult } from './types.js';

/**
 * Attempt to consume one (or `count`) spell slot(s) of the given level and type.
 * Returns the updated slot state on success, or a discriminated-union failure on error.
 *
 * Algorithm per design §4:
 * 1. Level guard (1..9)
 * 2. count defaults to 1
 * 3. pact branch
 * 4. regular branch
 */
export function consumeSpellSlot(input: SlotConsumptionInput): SlotConsumptionResult {
  const { slotsMax, slotsUsed, pactMagic, pactSlotsUsed, level, slotType } = input;
  const count = input.count ?? 1;

  // Step 1: level guard
  if (!Number.isInteger(level) || level < 1 || level > 9) {
    return {
      ok: false,
      issues: [{ code: 'SLOT_LEVEL_OUT_OF_RANGE', got: level }],
    };
  }

  if (slotType === 'pact') {
    // Step 3a: no pact magic
    if (pactMagic === null) {
      return { ok: false, issues: [{ code: 'NO_PACT_MAGIC' }] };
    }

    // Step 3b: level mismatch
    if (level !== pactMagic.slotLevel) {
      return {
        ok: false,
        issues: [{ code: 'PACT_LEVEL_MISMATCH', expected: pactMagic.slotLevel, got: level }],
      };
    }

    // Step 3c: availability check
    const available = pactMagic.slotCount - pactSlotsUsed;
    if (available < count) {
      return {
        ok: false,
        issues: [{
          code: 'SLOT_NOT_AVAILABLE',
          level,
          slotType: 'pact',
          expectedCount: count,
          gotCount: available,
        }],
      };
    }

    // Step 3d: success — slotsUsed unchanged
    return { ok: true, slotsUsed, pactSlotsUsed: pactSlotsUsed + count };
  }

  // Step 4: regular slot
  const idx = level - 1;
  const max = slotsMax[idx] ?? 0;
  const used = slotsUsed[idx] ?? 0;
  const available = max - used;

  if (available < count) {
    return {
      ok: false,
      issues: [{
        code: 'SLOT_NOT_AVAILABLE',
        level,
        slotType: 'regular',
        expectedCount: count,
        gotCount: available,
      }],
    };
  }

  // Build updated slotsUsed as a new array
  const nextUsed = [...slotsUsed] as number[];
  // Pad to length 9 if needed
  while (nextUsed.length < 9) nextUsed.push(0);
  nextUsed[idx] = used + count;

  return { ok: true, slotsUsed: nextUsed, pactSlotsUsed };
}
