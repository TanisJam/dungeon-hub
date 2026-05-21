import { ABILITY_KEYS, type AbilityKey, type AbilityScores } from '../stats/types.js';
import type { AppliedAsi } from '../race/types.js';

/**
 * Calcula los ability scores efectivos del personaje: baseStats + suma de ASIs
 * aplicados (de race, subrace, y eventualmente feats/ASI levels).
 *
 * Devuelve un objeto AbilityScores con valores absolutos (sin modificadores).
 */
export function computeEffectiveScores(
  baseStats: AbilityScores,
  asisApplied: AppliedAsi[] = [],
): AbilityScores {
  const out: AbilityScores = { ...baseStats };
  for (const asi of asisApplied) {
    out[asi.ability] = (out[asi.ability] ?? 0) + asi.bonus;
  }
  // Cap a 20 (regla general, salvo magic items). Para baseStats pre-feat-magic eso es seguro.
  // Nota: en realidad puede pasar de 20 con feats tipo Heavy Armor Master? No, esos no suben score.
  // Si en el futuro hay items que pasan el cap, lo manejamos diferente.
  for (const k of ABILITY_KEYS) {
    if (out[k] > 30) out[k] = 30; // hard cap legal en 5e
  }
  return out;
}

/** Devuelve solo los modifiers (floor((score-10)/2)). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function modifiersFromScores(scores: AbilityScores): Record<AbilityKey, number> {
  const out = {} as Record<AbilityKey, number>;
  for (const k of ABILITY_KEYS) out[k] = abilityModifier(scores[k]);
  return out;
}
