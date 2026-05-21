import type { AppliedClass } from '../class/types.js';

/**
 * Totales de hit dice por hit die ({ d6: 3, d10: 2 }) sumando todas las clases.
 * Equivale a `sheet.hitDice`. Útil para resets de long rest.
 */
export function hitDiceTotalsByDie(classes: AppliedClass[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of classes) {
    out[c.hitDie] = (out[c.hitDie] ?? 0) + c.level;
  }
  return out;
}

/** Total de hit dice (suma de todas las clases por nivel). */
export function hitDiceTotalCount(classes: AppliedClass[]): number {
  return classes.reduce((acc, c) => acc + c.level, 0);
}

/**
 * Cantidad de hit dice recuperados al terminar un long rest = `floor(level/2)`,
 * mínimo 1 (PHB p.186). Esta cantidad la distribuye el player entre sus dies
 * disponibles.
 */
export function hitDiceRecoveredOnLongRest(totalLevel: number): number {
  if (totalLevel < 1) return 0;
  return Math.max(1, Math.floor(totalLevel / 2));
}
