/**
 * PHB 2014 p.143 — Coin weight.
 * "Coins are small and light; 50 coins weigh 1 pound."
 * All denominations (cp, sp, ep, gp, pp) count equally toward the 50-per-lb rule.
 */

export type CoinCurrency = {
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
};

/**
 * Returns the weight in pounds contributed by the character's coins.
 * Formula: Math.floor(totalCoins / 50) per PHB p.143.
 * Returns 0 for null/undefined/empty currency.
 */
export function coinWeight(currency: CoinCurrency | null | undefined): number {
  if (!currency) return 0;
  const total =
    (currency.cp ?? 0) +
    (currency.sp ?? 0) +
    (currency.ep ?? 0) +
    (currency.gp ?? 0) +
    (currency.pp ?? 0);
  return Math.floor(total / 50);
}
