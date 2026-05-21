import type { AppliedClass } from '../class/types.js';
import type { CasterType } from './types.js';

/**
 * Clasifica una clase aplicada. EK/AT son detectados por subclass slug
 * (`eldritch-knight` / `arcane-trickster`).
 */
export function classifyCaster(c: AppliedClass): CasterType {
  switch (c.slug) {
    case 'bard':
    case 'cleric':
    case 'druid':
    case 'sorcerer':
    case 'wizard':
      return 'full';
    case 'paladin':
    case 'ranger':
      return 'half';
    case 'artificer':
      return 'artificer';
    case 'warlock':
      return 'warlock';
    case 'fighter':
      return c.subclass?.slug === 'eldritch-knight' ? 'third' : 'none';
    case 'rogue':
      return c.subclass?.slug === 'arcane-trickster' ? 'third' : 'none';
    default:
      return 'none';
  }
}

/**
 * Contribución al nivel efectivo de caster en multiclass (PHB p.165 + TCE p.10 para Artificer).
 *
 * - full:      +level
 * - half:      +floor(level / 2)   (Paladin/Ranger)
 * - artificer: +ceil(level / 2)    (TCE clarification)
 * - third:     +floor(level / 3)   (EK Fighter / AT Rogue)
 * - warlock / none: +0
 */
export function casterContribution(c: AppliedClass): number {
  const type = classifyCaster(c);
  switch (type) {
    case 'full':
      return c.level;
    case 'half':
      return Math.floor(c.level / 2);
    case 'artificer':
      return Math.ceil(c.level / 2);
    case 'third':
      return Math.floor(c.level / 3);
    case 'warlock':
    case 'none':
      return 0;
  }
}
