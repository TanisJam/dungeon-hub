import type { CategoryDef } from './types';

// PHB 2014 — Biblioteca grid: ONLY general/manual knowledge anyone can read.
// codex-ia-reframe W1 (REQ-BIB-02, decision #1966): items move to the Mercado wave;
// monsters + lore are world-knowledge (Bitácora wave) — they are NOT library cards.
// Their detail routes stay reachable (direct/linked); only the cards are dropped here.
// Labels only — counts are real and fetched server-side in page.tsx.
export const V3_COMPENDIUM_CATS: CategoryDef[] = [
  { id: 'spells',      name: 'Hechizos',     icon: 'sparkle', cls: 'spell' },
  { id: 'races',       name: 'Razas',         icon: 'user',    cls: ''      },
  { id: 'classes',     name: 'Clases',        icon: 'shield',  cls: ''      },
  { id: 'backgrounds', name: 'Trasfondos',    icon: 'scroll',  cls: ''      },
  { id: 'feats',       name: 'Dotes',         icon: 'star',    cls: ''      },
  { id: 'conditions',  name: 'Estados',       icon: 'bolt',    cls: ''      },
];
