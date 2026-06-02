import type { CategoryDef } from './types';

// PHB 2014 — category icons and tints for the 7-card grid.
// Labels only — counts are real and fetched server-side in page.tsx.
// 'lore' has no API endpoint and renders disabled ("Próximamente").
// 'backgrounds' is new in V1 browser; REQ-CBROWSE-01.
export const V3_COMPENDIUM_CATS: CategoryDef[] = [
  { id: 'spells',      name: 'Hechizos',     icon: 'sparkle', cls: 'spell' },
  { id: 'items',       name: 'Items',         icon: 'bag',     cls: ''      },
  { id: 'races',       name: 'Razas',         icon: 'user',    cls: ''      },
  { id: 'classes',     name: 'Clases',        icon: 'shield',  cls: ''      },
  { id: 'monsters',    name: 'Monstruos',     icon: 'flame',   cls: ''      },
  { id: 'backgrounds', name: 'Trasfondos',    icon: 'scroll',  cls: ''      },
  { id: 'lore',        name: 'Lore',          icon: 'scroll',  cls: 'lore'  },
];
