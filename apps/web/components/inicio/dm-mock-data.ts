// MOCK DATA — DM tree fixtures. Replace via inicio-data-wiring SDD.

export type PendingFichaSummary = {
  id: string;
  portraitInitial: string;
  pj: string;
  lineage: string;
  player: string;
  sent: string;
  fresh: boolean;
};

export type DMCampaignNextSession = {
  id: string;
  name: string;
  tagline: string;
  nextSession: string;   // e.g. "VIE 21:30"
  players: number;
  pendingQuests: number;
  sessions: number;      // sessions played so far → next is sessions + 1
};

export type QuestSinTocar = {
  id: string;
  title: string;
  lastChange: string;    // e.g. "hace 3 días"
};

export const MOCK_PENDING_FICHAS: PendingFichaSummary[] = [
  {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    portraitInitial: 'M',
    pj: 'Mírelle Vaelthar',
    lineage: 'Elfa de luna · Hechicera',
    player: 'mau',
    sent: 'hace 2 horas',
    fresh: true,
  },
  {
    id: 'b1ffcd00-ad1c-4f09-bc7e-7cc0ce491b22',
    portraitInitial: 'A',
    pj: 'Arken Drûm',
    lineage: 'Enano de montaña · Clérigo',
    player: 'lu',
    sent: 'hace 3 días',
    fresh: false,
  },
  {
    id: 'c2aabd11-be2d-4019-bd8f-8dd1df5a2c33',
    portraitInitial: 'R',
    pj: 'Ravenna Solé',
    lineage: 'Humana · Pícara',
    player: 'fede',
    sent: 'hace 5 días',
    fresh: false,
  },
];

export const MOCK_PENDING_OLDEST_AGE = 'hace 1 semana';

export const MOCK_DM_NEXT_CAMPAIGN: DMCampaignNextSession = {
  id: 'mock-dm-camp-1',
  name: 'El Pacto de las Tres Lunas',
  tagline: 'Sangre vieja, lunas nuevas',
  nextSession: 'VIE 21:30',
  players: 4,
  pendingQuests: 3,
  sessions: 7,
};

export const MOCK_QUESTS_SIN_TOCAR: QuestSinTocar[] = [
  { id: 'q1', title: 'El correo perdido', lastChange: 'hace 3 días' },
  { id: 'q2', title: 'La torre del pacto', lastChange: 'hace 5 días' },
];
