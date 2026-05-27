// MOCK DATA — replace via inicio-data-wiring SDD

export type NextCampaign = {
  id: string;
  name: string;
  tagline: string;
  daysToSession: number;
  nextSession: string;    // e.g. "VIE 21:30"
  sessions: number;       // sessions played so far → next is sessions + 1
};

export type ActiveCharacter = {
  id: string;
  name: string;
  initial: string;        // single uppercase glyph for portrait fallback
  lineage: string;        // e.g. "Semielfo · Bardo 3"
  hp: string;             // e.g. "24/24"
  ac: number;             // e.g. 14
  init: number;           // signed mod → render as `+${init}` if >= 0
};

export type Novedad = {
  id: string;
  ttl: string;            // headline
  sub: string;            // short context
  when: string;           // e.g. "hace 2h"
  fresh: boolean;
};

export const MOCK_NEXT_CAMPAIGN: NextCampaign = {
  id: 'mock-camp-1',
  name: 'Las Tres Lunas',
  tagline: 'Una pacto se rompe bajo el cielo gemelo',
  daysToSession: 2,
  nextSession: 'VIE 21:30',
  sessions: 7,
};

export const MOCK_ACTIVE_CHAR: ActiveCharacter = {
  id: 'mock-char-1',
  name: 'Brann Cuervosombrío',
  initial: 'B',
  lineage: 'Semielfo · Bardo 3',
  hp: '21/24',
  ac: 13,
  init: 3,
};

export const MOCK_NOVEDADES: Novedad[] = [
  { id: 'n1', ttl: 'Mara subió a nivel 4',          sub: 'Druida — eligió Círculo de la Luna',     when: 'hace 2h', fresh: true  },
  { id: 'n2', ttl: 'Nueva quest: El correo perdido', sub: 'Pacto en la torre — abierta por el DM', when: 'hace 6h', fresh: true  },
  { id: 'n3', ttl: 'Sesión 7 cerrada',               sub: 'XP repartida · loot dividido',          when: 'ayer',    fresh: false },
];
