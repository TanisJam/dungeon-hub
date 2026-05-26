import { deriveAsiLevels } from '../class/asi-levels.js';
import type { ClassCompendiumData } from '../class/types.js';

/**
 * Returns true if `level` is an ASI level for the given class.
 * Thin wrapper over `deriveAsiLevels` — single source of truth.
 *
 * PHB rules:
 *   Fighter (PHB p.72): ASI at 4, 6, 8, 12, 14, 16, 19
 *   Rogue   (PHB p.96): ASI at 4, 8, 10, 12, 16, 19
 *   Others:             ASI at 4, 8, 12, 16, 19
 */
export function isAsiLevelFor(classData: ClassCompendiumData, level: number): boolean {
  const levels = deriveAsiLevels(classData.classFeatures);
  return levels.includes(level);
}
