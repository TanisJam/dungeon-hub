/**
 * Tabla de XP por nivel total — PHB p.15.
 * Índice 0 = level 1 = 0 XP, índice 19 = level 20 = 355,000 XP.
 */
export const XP_THRESHOLDS: readonly number[] = [
  0,        // 1
  300,      // 2
  900,      // 3
  2_700,    // 4
  6_500,    // 5
  14_000,   // 6
  23_000,   // 7
  34_000,   // 8
  48_000,   // 9
  64_000,   // 10
  85_000,   // 11
  100_000,  // 12
  120_000,  // 13
  140_000,  // 14
  165_000,  // 15
  195_000,  // 16
  225_000,  // 17
  265_000,  // 18
  305_000,  // 19
  355_000,  // 20
];

/** XP mínimo necesario para alcanzar `level` (1-20). Throws si está fuera de rango. */
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error(`xpForLevel: level fuera de rango: ${level}`);
  }
  return XP_THRESHOLDS[level - 1]!;
}

/**
 * Devuelve el nivel total alcanzado con cierto XP (1-20). Si xp >= threshold de 20, devuelve 20.
 */
export function levelForXp(xp: number): number {
  if (xp < 0) return 1;
  for (let lv = 20; lv >= 1; lv--) {
    if (xp >= XP_THRESHOLDS[lv - 1]!) return lv;
  }
  return 1;
}

/**
 * ¿El personaje tiene XP suficiente para llegar a `targetLevel`?
 * Devuelve null si OK, o `{ required, current, missing }` si falta XP.
 */
export function canReachLevel(xp: number, targetLevel: number): null | {
  required: number;
  current: number;
  missing: number;
} {
  const required = xpForLevel(targetLevel);
  if (xp >= required) return null;
  return { required, current: xp, missing: required - xp };
}
