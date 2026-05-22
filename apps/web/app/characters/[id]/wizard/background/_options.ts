// Listas estándar de 5e para "any X" choices en backgrounds.
// PHB-based — si Mauricio quiere agregar de Tasha's/MPMM, son menores.
// TODO si esto crece, mover a packages/domain.

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

export const GAMING_SETS = [
  'dice-set',
  'dragonchess-set',
  'playing-card-set',
  'three-dragon-ante-set',
];

export const ARTISANS_TOOLS = [
  'alchemists-supplies',
  'brewers-supplies',
  'calligraphers-supplies',
  'carpenters-tools',
  'cartographers-tools',
  'cobblers-tools',
  'cooks-utensils',
  'glassblowers-tools',
  'jewelers-tools',
  'leatherworkers-tools',
  'masons-tools',
  'painters-supplies',
  'potters-tools',
  'smiths-tools',
  'tinkers-tools',
  'weavers-tools',
  'woodcarvers-tools',
];

export const MUSICAL_INSTRUMENTS = [
  'bagpipes',
  'drum',
  'dulcimer',
  'flute',
  'horn',
  'lute',
  'lyre',
  'pan-flute',
  'shawm',
  'viol',
];

export function poolFor(kind: string): string[] {
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
