export type PersonajeStatus =
  | 'draft'
  | 'active'
  | 'pending_approval'
  | 'retired'
  | 'dead';

export type StatusChip = 'active' | 'pending' | 'retired' | 'draft' | 'all';

export type RosterCharacter = {
  id: string;
  worldId: string;
  name: string;
  status: PersonajeStatus | string; // tolerate unknown server values
  xp: number;
  updatedAt: string;
};

export type ChipCounts = {
  active: number;
  pending: number;
  retired: number;
  draft: number;
  all: number;
};
