/**
 * Unit tests for purchaseItems.
 *
 * RED commit — written FIRST before implementation.
 *
 * Reqs: sdd/market-shop-domain — AFFORD-01/02, CHANGE-01/02, QTY-01, PURITY-01, EDGE-01.
 * PHB p.143 — coin conversion table: 1 cp = base unit; 1 sp = 10 cp; 1 ep = 50 cp;
 * 1 gp = 100 cp; 1 pp = 1000 cp.
 */
import { describe, it, expect } from 'vitest';
import { purchaseItems } from './purchase.js';
import { EMPTY_CURRENCY, type Currency } from '../sheet/types.js';

function purse(overrides: Partial<Currency>): Currency {
  return { ...EMPTY_CURRENCY, ...overrides };
}

// ── AFFORD: sufficient / insufficient funds ────────────────────────────────

describe('purchaseItems — affordability (PHB p.143)', () => {
  it('AFFORD-01: exact funds — 15 gp purse, costCp 1500 → ok, spentCp 1500, purse drained to zero', () => {
    const result = purchaseItems({ costCp: 1500, purse: purse({ gp: 15 }) });
    expect(result).toEqual({
      ok: true,
      newPurse: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      spentCp: 1500,
    });
  });

  it('AFFORD-02: insufficient funds — 10 gp purse (1000 cp), costCp 1500 → INSUFFICIENT_FUNDS with exact shortfall', () => {
    const result = purchaseItems({ costCp: 1500, purse: purse({ gp: 10 }) });
    expect(result).toEqual({
      ok: false,
      issues: [{ code: 'INSUFFICIENT_FUNDS', requestedCp: 1500, availableCp: 1000, shortfallCp: 500 }],
    });
  });
});

// ── CHANGE: re-expression of remaining coins, largest-first, without ep ────

describe('purchaseItems — change re-expression (PHB p.143)', () => {
  it('CHANGE-01a: 2 pp purse, costCp 1500 → change 500 cp re-expressed as 5 gp (no smaller coins left)', () => {
    const result = purchaseItems({ costCp: 1500, purse: purse({ pp: 2 }) });
    expect(result).toEqual({
      ok: true,
      newPurse: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 },
      spentCp: 1500,
    });
  });

  it('CHANGE-01b: 1 pp purse, costCp 537 → change 463 cp re-expressed as 4 gp 6 sp 3 cp (ep and pp both zeroed)', () => {
    const result = purchaseItems({ costCp: 537, purse: purse({ pp: 1 }) });
    expect(result).toEqual({
      ok: true,
      newPurse: { cp: 3, sp: 6, ep: 0, gp: 4, pp: 0 },
      spentCp: 537,
    });
  });

  it('CHANGE-02: 4 ep purse (200 cp), costCp 150 → change 50 cp re-expressed as 5 sp (ep is never re-issued)', () => {
    const result = purchaseItems({ costCp: 150, purse: purse({ ep: 4 }) });
    expect(result).toEqual({
      ok: true,
      newPurse: { cp: 0, sp: 5, ep: 0, gp: 0, pp: 0 },
      spentCp: 150,
    });
  });
});

// ── QTY: quantity multiplier and validation ─────────────────────────────────

describe('purchaseItems — quantity (QTY-01)', () => {
  it('quantity 3 at costCp 100 with a 10 gp purse → ok, spentCp 300 (100 × 3)', () => {
    const result = purchaseItems({ costCp: 100, quantity: 3, purse: purse({ gp: 10 }) });
    expect(result).toEqual({
      ok: true,
      newPurse: { cp: 0, sp: 0, ep: 0, gp: 7, pp: 0 },
      spentCp: 300,
    });
  });

  it('quantity 0 → INVALID_QUANTITY, purse is never inspected', () => {
    const result = purchaseItems({ costCp: 100, quantity: 0, purse: purse({ gp: 10 }) });
    expect(result).toEqual({
      ok: false,
      issues: [{ code: 'INVALID_QUANTITY', quantity: 0 }],
    });
  });

  it('quantity -1 → INVALID_QUANTITY', () => {
    const result = purchaseItems({ costCp: 100, quantity: -1, purse: purse({ gp: 10 }) });
    expect(result).toEqual({
      ok: false,
      issues: [{ code: 'INVALID_QUANTITY', quantity: -1 }],
    });
  });

  it('quantity 2.5 (non-integer) → INVALID_QUANTITY', () => {
    const result = purchaseItems({ costCp: 100, quantity: 2.5, purse: purse({ gp: 10 }) });
    expect(result).toEqual({
      ok: false,
      issues: [{ code: 'INVALID_QUANTITY', quantity: 2.5 }],
    });
  });
});

// ── PURITY: never mutate the input purse ────────────────────────────────────

describe('purchaseItems — purity (PURITY-01)', () => {
  it('does not mutate input.purse', () => {
    const inputPurse = purse({ gp: 15, sp: 3 });
    const snapshot = JSON.parse(JSON.stringify(inputPurse));

    purchaseItems({ costCp: 1500, purse: inputPurse });

    expect(inputPurse).toEqual(snapshot);
  });
});

// ── EDGE: zero-cost purchase ─────────────────────────────────────────────────

describe('purchaseItems — edge cases (EDGE-01)', () => {
  it('empty purse + costCp 0 → ok, spentCp 0, purse unchanged', () => {
    const result = purchaseItems({ costCp: 0, purse: purse({}) });
    expect(result).toEqual({
      ok: true,
      newPurse: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      spentCp: 0,
    });
  });
});
