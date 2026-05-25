import type { ClassCompendiumData } from './types.js';

/**
 * Deriva los niveles de ASI para una clase a partir de su classFeatures[].
 *
 * PHB regla:
 *   Fighter (PHB p.72): ASI a 4, 6, 8, 12, 14, 16, 19 — 7 oportunidades
 *   Rogue   (PHB p.96): ASI a 4, 8, 10, 12, 16, 19    — 6 oportunidades
 *   Resto de clases PHB: ASI a 4, 8, 12, 16, 19        — 5 oportunidades
 *
 * 5etools codifica ASI como entradas "Ability Score Improvement|ClassName||Level"
 * en el array classFeatures. Se usa un Set para deduplicar entradas con sufijo
 * TCE/XPHB que apunten al mismo nivel.
 *
 * @param classFeatures - Array de features de la clase desde compendium_classes
 * @returns Sorted, deduplicated array of ASI levels (ascending)
 */
export function deriveAsiLevels(
  classFeatures: ClassCompendiumData['classFeatures'],
): number[] {
  const levels = new Set<number>();

  for (const f of classFeatures) {
    const raw = typeof f === 'string' ? f : f.classFeature;
    if (!raw || !raw.startsWith('Ability Score Improvement|')) continue;
    const parts = raw.split('|');
    const level = Number(parts[3]);
    if (Number.isFinite(level) && level >= 1 && level <= 20) {
      levels.add(level);
    }
  }

  // Fallback: standard cadence when no ASI entries found (shouldn't happen
  // for valid PHB class data, but ensures safe behavior for malformed imports).
  if (levels.size === 0) {
    return [4, 8, 12, 16, 19];
  }

  return Array.from(levels).sort((a, b) => a - b);
}
