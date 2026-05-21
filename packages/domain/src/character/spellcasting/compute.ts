import type { AppliedClass } from '../class/types.js';
import { casterContribution, classifyCaster } from './caster-type.js';
import {
  ARTIFICER_TABLE,
  FULL_CASTER_TABLE,
  HALF_CASTER_TABLE,
  THIRD_CASTER_TABLE,
  warlockPactMagic,
} from './slot-tables.js';
import { NO_SLOTS, type SpellSlots, type SpellSlotsResult } from './types.js';

function lookup(table: ReadonlyArray<SpellSlots>, level: number): SpellSlots {
  if (level < 1) return NO_SLOTS;
  const clamped = Math.min(level, 20);
  return table[clamped] ?? NO_SLOTS;
}

/**
 * Devuelve los slots de spells (1st-9th) + Pact Magic separado.
 *
 * Reglas:
 * 1. Warlock siempre va por Pact Magic, separado. Contribuye 0 a slots regulares.
 * 2. Si exactamente UNA clase caster no-warlock y es half/third/artificer →
 *    usa la tabla single-class de esa clase (más restrictiva que multiclass a niveles bajos).
 * 3. Otros casos (incluye single full caster, multi-caster, multi con warlock) →
 *    suma contribuciones (PHB p.165 + TCE p.10) y lookup en la full-caster table.
 *
 * Las clases sin spellcasting (Barbarian, Monk, etc.) o subclases no-caster
 * (Fighter sin EK, Rogue sin AT) contribuyen 0.
 */
export function computeSpellSlots(classes: AppliedClass[]): SpellSlotsResult {
  const warlock = classes.find((c) => c.slug === 'warlock');
  const pactMagic = warlock ? warlockPactMagic(warlock.level) : null;

  const casters = classes.filter((c) => {
    const t = classifyCaster(c);
    return t !== 'none' && t !== 'warlock';
  });

  if (casters.length === 0) {
    return { slots: NO_SLOTS, pactMagic };
  }

  if (casters.length === 1) {
    const c = casters[0]!;
    const type = classifyCaster(c);
    switch (type) {
      case 'half':
        return { slots: lookup(HALF_CASTER_TABLE, c.level), pactMagic };
      case 'artificer':
        return { slots: lookup(ARTIFICER_TABLE, c.level), pactMagic };
      case 'third':
        return { slots: lookup(THIRD_CASTER_TABLE, c.level), pactMagic };
      case 'full':
        // Una sola full caster — el multiclass table es idéntico al full table.
        return { slots: lookup(FULL_CASTER_TABLE, c.level), pactMagic };
      default:
        return { slots: NO_SLOTS, pactMagic };
    }
  }

  // Multiclass: sumar contribuciones y mirar en la tabla full.
  const effective = casters.reduce((acc, c) => acc + casterContribution(c), 0);
  return { slots: lookup(FULL_CASTER_TABLE, effective), pactMagic };
}
