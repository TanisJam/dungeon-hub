/**
 * rollStartingGold — pure utility; RNG is injected for deterministic testing.
 *
 * REQ-SEQUIP-06 (PHB p.143 "Starting Wealth by Class"):
 * "Instead of taking the starting equipment given by your class and background,
 *  you can start with a number of gold pieces based on your class and spend them
 *  on items from chapter 5."
 *
 * ADR-3: The resolver is pure (value-in). The ROLL happens here, in the web layer
 * (triggered by the roll button), and the RESULT is passed to the resolver.
 * This keeps the resolver deterministic and idempotency-safe.
 *
 * Dice formula format (output of parseGoldAlternative from parse.ts):
 *   "5d4 × 10"   — Fighter (PHB p.143: 5d4 × 10 gp)
 *   "4d4 × 10"   — Wizard  (PHB p.143: 4d4 × 10 gp)
 *
 * The × character is Unicode U+00D7 (not ASCII 'x').
 *
 * Roll formula per die: Math.floor(rng() * sides) + 1
 *   - rng() ∈ [0, 1)
 *   - d4:  floor(rng() × 4) + 1  → range [1, 4]
 *   - d6:  floor(rng() × 6) + 1  → range [1, 6]
 */

/**
 * Roll a starting gold amount from a 5etools dice expression.
 *
 * @param diceExpr  The canonical dice expression string, e.g. "5d4 × 10".
 *                  Extracted from `{@dice …}` by parseGoldAlternative.
 * @param rng       Random number generator — returns a float in [0, 1).
 *                  Pass `Math.random` in production; pass a deterministic stub in tests.
 * @returns         The rolled gold amount in gp (integer).
 *
 * @example
 * // Production:
 * const gp = rollStartingGold('5d4 × 10', Math.random);
 *
 * // Test (deterministic):
 * const gp = rollStartingGold('5d4 × 10', () => 0.99); // → 200
 */
export function rollStartingGold(diceExpr: string, rng: () => number): number {
  // Parse "NdY × Z" — Unicode × (U+00D7)
  // Regex: capture count (N), sides (Y), and multiplier (Z)
  const match = diceExpr.match(/^(\d+)d(\d+)\s*[×x]\s*(\d+)$/);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(
      `rollStartingGold: unrecognised dice expression "${diceExpr}". ` +
      `Expected format: "NdY × Z" (e.g. "5d4 × 10").`,
    );
  }

  const count = parseInt(match[1], 10);    // number of dice
  const sides = parseInt(match[2], 10);    // sides per die
  const multiplier = parseInt(match[3], 10); // gold multiplier

  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += Math.floor(rng() * sides) + 1;
  }

  return sum * multiplier;
}
