import type {
  FeaturePicks,
  FeatureRef,
  FeaturesValidationIssue,
  FeaturesValidationResult,
  OptionalFeatureLite,
  ResolvedSlot,
} from './types.js';

/**
 * Valida que las picks del usuario satisfagan los slots resueltos.
 *
 * Reglas:
 * 1. Cada feature key en `picks` tiene que mapear a un slot resuelto.
 * 2. La cantidad de features picados para cada featureType debe igualar el count
 *    esperado por la suma de slots de ese featureType en `slots`.
 * 3. Cada feature picada debe existir en `available` (= compendio filtrado por
 *    Rules Profile) y tener el featureType bajo el que fue picada.
 * 4. No se permite el mismo (slug, source) más de una vez en el mismo featureType.
 *
 * El caller filtra `available` con el Rules Profile ANTES de invocar (incluido
 * el toggle de Tasha's). Si una feature no aparece en `available`, es porque
 * está deshabilitada o no existe.
 */
export function validateClassFeaturePicks(args: {
  picks: FeaturePicks;
  slots: ResolvedSlot[];
  available: ReadonlyArray<OptionalFeatureLite>;
  classSlug: string;
  classLevel: number;
}): FeaturesValidationResult {
  const { picks, slots, available, classSlug, classLevel } = args;
  const issues: FeaturesValidationIssue[] = [];

  // Sumar la cantidad esperada por featureType (un mismo featureType puede aparecer
  // en varios slots si dos progression blocks lo comparten — sumamos).
  const expectedByType = new Map<string, number>();
  for (const slot of slots) {
    // El usuario puede elegir UN featureType del array por pick, pero el slot total
    // se llena con la suma. Para validar simple: cada featureType del slot acepta
    // hasta `count` picks; el caller debe alocar correctamente.
    //
    // Decisión simple: cada slot.featureType[i] queda con un "cupo" de `count`.
    // Si un usuario pica más de count en un único featureType, falla.
    // Si dos slots distintos comparten featureType, el cupo total es la suma.
    for (const ft of slot.featureType) {
      expectedByType.set(ft, (expectedByType.get(ft) ?? 0) + slot.count);
    }
  }

  // Validar que cada featureType en picks esté permitido a este nivel.
  for (const featureType of Object.keys(picks)) {
    if (!expectedByType.has(featureType)) {
      issues.push({
        code: 'FEATURE_TYPE_NOT_ON_CLASS_AT_LEVEL',
        featureType,
        classSlug,
        classLevel,
      });
    }
  }

  // Validar conteo + cada pick individual.
  const availableMap = new Map<string, OptionalFeatureLite>();
  for (const f of available) availableMap.set(`${f.slug}|${f.source}`, f);

  const applied: FeaturePicks = {};
  for (const [featureType, picksForType] of Object.entries(picks)) {
    const expected = expectedByType.get(featureType) ?? 0;
    if (picksForType.length !== expected) {
      issues.push({
        code: 'FEATURE_COUNT_MISMATCH',
        featureType,
        expected,
        got: picksForType.length,
      });
      continue;
    }

    const seen = new Set<string>();
    const validated: FeatureRef[] = [];
    for (const pick of picksForType) {
      const key = `${pick.slug}|${pick.source}`;
      if (seen.has(key)) {
        issues.push({ code: 'FEATURE_DUPLICATE', feature: pick, featureType });
        continue;
      }
      seen.add(key);

      const lite = availableMap.get(key);
      if (!lite) {
        // No está en availables: puede ser porque no existe o porque el Rules
        // Profile lo deshabilitó. Emitimos genérico FEATURE_DISABLED_BY_RULES_PROFILE.
        issues.push({ code: 'FEATURE_DISABLED_BY_RULES_PROFILE', feature: pick });
        continue;
      }

      if (!lite.featureType.includes(featureType)) {
        issues.push({
          code: 'FEATURE_WRONG_TYPE',
          feature: pick,
          claimedFeatureType: featureType,
          actualFeatureTypes: [...lite.featureType],
        });
        continue;
      }

      validated.push(pick);
    }
    applied[featureType] = validated;
  }

  // Cualquier featureType esperado pero no incluido en picks → falta.
  for (const [featureType, expected] of expectedByType) {
    if (!(featureType in picks)) {
      issues.push({
        code: 'FEATURE_COUNT_MISMATCH',
        featureType,
        expected,
        got: 0,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, applied };
}
