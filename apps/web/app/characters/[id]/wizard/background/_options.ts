// Listas estándar de 5e para "any X" choices en backgrounds.
// PHB-based — si Mauricio quiere agregar de Tasha's/MPMM, son menores.

// Tool pools — single source of truth lives in packages/domain.
import {
  ARTISANS_TOOLS,
  GAMING_SETS,
  MUSICAL_INSTRUMENTS,
} from '@dungeon-hub/domain/character/tool';

export { ARTISANS_TOOLS, GAMING_SETS, MUSICAL_INSTRUMENTS };

export const STANDARD_LANGUAGES = [
  'common',
  'dwarvish',
  'elvish',
  'giant',
  'gnomish',
  'goblin',
  'halfling',
  'orc',
];

export const EXOTIC_LANGUAGES = [
  'abyssal',
  'celestial',
  'deep-speech',
  'draconic',
  'infernal',
  'primordial',
  'sylvan',
  'undercommon',
];

export const ANY_LANGUAGES = [...STANDARD_LANGUAGES, ...EXOTIC_LANGUAGES];

export function poolFor(kind: string): readonly string[] {
  switch (kind) {
    case 'anyStandard': return STANDARD_LANGUAGES;
    case 'anyExotic': return EXOTIC_LANGUAGES;
    case 'any': return ANY_LANGUAGES;
    case 'anyGamingSet': return GAMING_SETS;
    case 'anyArtisansTool': return ARTISANS_TOOLS;
    case 'anyMusicalInstrument': return MUSICAL_INSTRUMENTS;
    default: return [];
  }
}

export function titleCase(slug: string): string {
  return slug
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
