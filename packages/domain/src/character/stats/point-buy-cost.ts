/**
 * Tabla de costos del Point Buy según PHB p.13.
 * Scores fuera de [8, 15] son inválidos en Point Buy.
 */
export const POINT_BUY_COST: Readonly<Record<number, number>> = Object.freeze({
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
});

/** Budget total disponible para gastar — PHB p.13. */
export const POINT_BUY_BUDGET = 27;

/** Standard Array — PHB p.13: 15, 14, 13, 12, 10, 8. */
export const STANDARD_ARRAY: readonly number[] = Object.freeze([15, 14, 13, 12, 10, 8]);
