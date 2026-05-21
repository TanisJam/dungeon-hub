import type { ClassFeatureSource, FeatureProgressionBlock, ResolvedSlot } from './types.js';

/**
 * Resuelve cuántos picks de cada grupo se tienen al nivel dado, combinando
 * class + subclass.
 *
 * El campo `progression` es un map cumulativo `{ "3": 3, "7": 5 }`: a level 7
 * tenés 5 totales, no 5 nuevos.
 *
 * Si el class/subclass no tiene `optionalfeatureProgression`, no contribuye.
 */
export function resolveFeatureSlots(args: {
  classData: ClassFeatureSource;
  subclassData?: ClassFeatureSource | null;
  classLevel: number;
}): ResolvedSlot[] {
  const blocks: FeatureProgressionBlock[] = [
    ...(args.classData.optionalfeatureProgression ?? []),
    ...(args.subclassData?.optionalfeatureProgression ?? []),
  ];

  const out: ResolvedSlot[] = [];
  for (const block of blocks) {
    const count = countAtLevel(block.progression, args.classLevel);
    if (count > 0) {
      out.push({
        name: block.name,
        featureType: [...block.featureType],
        count,
      });
    }
  }
  return out;
}

/**
 * Toma el count del HIGHEST level key que sea <= classLevel.
 *
 * En 5etools la progression viene estrictamente creciente, pero por las dudas
 * (y para evitar asumir orden de keys de Object.entries) tomamos el aplicable
 * con mayor level.
 */
function countAtLevel(progression: Record<string, number>, classLevel: number): number {
  let bestLevel = 0;
  let best = 0;
  for (const [lvKey, count] of Object.entries(progression)) {
    const lv = Number(lvKey);
    if (Number.isFinite(lv) && lv <= classLevel && lv > bestLevel) {
      bestLevel = lv;
      best = count;
    }
  }
  return best;
}
