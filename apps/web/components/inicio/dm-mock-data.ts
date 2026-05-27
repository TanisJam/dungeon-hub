// MOCK DATA — DM tree fixtures. Replace via inicio-data-wiring SDD.

export type PendingFichaSummary = {
  id: string;
  portraitInitial: string;
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
  { id: 'pf1', portraitInitial: 'M' },
  { id: 'pf2', portraitInitial: 'A' },
  { id: 'pf3', portraitInitial: 'R' },
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
