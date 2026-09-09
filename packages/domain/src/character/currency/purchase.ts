import type { Currency } from '../sheet/types.js';

/**
 * PHB p.143 — coin conversion table (copper-piece base unit):
 * 1 cp = 1 cp, 1 sp = 10 cp, 1 ep = 50 cp, 1 gp = 100 cp, 1 pp = 1000 cp.
 */
const CP_PER_COIN = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as const;

export type PurchaseIssue =
  | { code: 'INSUFFICIENT_FUNDS'; requestedCp: number; availableCp: number; shortfallCp: number }
  | { code: 'INVALID_QUANTITY'; quantity: number };

export type PurchaseResult =
  | { ok: true; newPurse: Currency; spentCp: number }
  | { ok: false; issues: PurchaseIssue[] };

export interface PurchaseInput {
  /** Unit cost expressed in copper pieces. */
  costCp: number;
  /** Number of units purchased. Must be a positive integer when provided. Defaults to 1. */
  quantity?: number;
  /** Purchaser's current purse. Never mutated. */
  purse: Currency;
}

/**
 * Pure domain helper: spends coins from a character's purse to buy `quantity`
 * units of an item priced at `costCp` copper each, then re-expresses the
 * remaining purse using the fewest coins largest-first (PHB p.143).
 *
 * Electrum (ep) is never re-issued as change — this project's market flows
 * treat ep as a legacy denomination the DM may hold but the shop never makes
 * change in. Change is expressed only in pp/gp/sp/cp.
 */
export function purchaseItems(input: PurchaseInput): PurchaseResult {
  const { costCp, purse } = input;
  const quantity = input.quantity ?? 1;

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { ok: false, issues: [{ code: 'INVALID_QUANTITY', quantity }] };
  }

  const totalCost = costCp * quantity;

  const availableCp =
    (purse.cp ?? 0) * CP_PER_COIN.cp +
    (purse.sp ?? 0) * CP_PER_COIN.sp +
    (purse.ep ?? 0) * CP_PER_COIN.ep +
    (purse.gp ?? 0) * CP_PER_COIN.gp +
    (purse.pp ?? 0) * CP_PER_COIN.pp;

  if (availableCp < totalCost) {
    return {
      ok: false,
      issues: [
        {
          code: 'INSUFFICIENT_FUNDS',
          requestedCp: totalCost,
          availableCp,
          shortfallCp: totalCost - availableCp,
        },
      ],
    };
  }

  let remaining = availableCp - totalCost;
  const pp = Math.floor(remaining / CP_PER_COIN.pp);
  remaining %= CP_PER_COIN.pp;
  const gp = Math.floor(remaining / CP_PER_COIN.gp);
  remaining %= CP_PER_COIN.gp;
  const sp = Math.floor(remaining / CP_PER_COIN.sp);
  remaining %= CP_PER_COIN.sp;
  const cp = remaining;

  return {
    ok: true,
    newPurse: { cp, sp, ep: 0, gp, pp },
    spentCp: totalCost,
  };
}
