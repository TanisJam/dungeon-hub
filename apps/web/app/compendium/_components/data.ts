import type { CategoryDef, RecentDef, SpellDetail } from './types';

// PHB 2014 — category icons and tints for the 6-card grid (WCP-GRID-03)
export const V3_COMPENDIUM_CATS: CategoryDef[] = [
  { id: 'spells',   name: 'Hechizos', icon: 'sparkle', cls: 'spell' },
  { id: 'items',    name: 'Items',    icon: 'bag',     cls: ''      },
  { id: 'races',    name: 'Razas',    icon: 'user',    cls: ''      },
  { id: 'classes',  name: 'Clases',   icon: 'shield',  cls: ''      },
  { id: 'monsters', name: 'Monstruos',icon: 'flame',   cls: ''      },
  { id: 'lore',     name: 'Lore',     icon: 'scroll',  cls: 'lore'  },
];

// Static recents rows (WCP-RECENTS-05)
export const V3_RECENT: RecentDef[] = [
  { id: 'fireball',    name: 'Bola de fuego',  sub: 'Hechizo · Nivel 3',         icon: 'flame',  cls: 'spell' },
  { id: 'chain-mail',  name: 'Cota de mallas', sub: 'Armadura media · 55 po',    icon: 'shield', cls: 'item'  },
  { id: 'goblin',      name: 'Goblin',          sub: 'Monstruo · CR ¼',           icon: 'eye',    cls: 'monst' },
  { id: 'mage-hand',   name: 'Mano Arcana',     sub: 'Hechizo · Truco',           icon: 'wand',   cls: 'spell' },
];

// PHB 2014 p.241 — Fireball: Level 3, Evocation, 1 action, 150 ft, V/S/M, instantaneous, 8d6 fire
export const V3_SPELL_DETAIL: SpellDetail = {
  level: 3,
  eyebrow: 'Hechizo · Nivel 3',
  name: 'Fireball',
  school: 'Evocación',
  meta: [
    { k: 'Tiempo',      v: '1 acción'   },
    { k: 'Rango',       v: '150 pies'   },
    { k: 'Componentes', v: 'V, S, M'    },
    { k: 'Duración',    v: 'Instantánea' },
  ],
  paragraphs: [
    'Un brillante rayo de ámbar sale de tu dedo apuntado hacia un punto que elijas dentro del alcance y luego florece con un rugido grave en una explosión de llamas.',
    'Cada criatura en una esfera de 20 pies de radio centrada en ese punto debe hacer una tirada de salvación de Destreza. Una criatura recibe 8d6 de daño de fuego en una salvación fallida, o la mitad en una exitosa.',
  ],
};
