export type CombatantKind = 'pc' | 'npc';

export type EncounterCombatant = {
  id: string;
  name: string;
  kind: CombatantKind;
  characterId: string | null;
  initiative: number;
  hpCurrent: number;
  hpMax: number;
  insertionOrder: number;
};

export type EncounterDetail = {
  id: string;
  campaignId: string;
  sessionId: string | null;
  name: string;
  round: number;
  status: 'active' | 'completed';
  currentCombatantId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  combatants: EncounterCombatant[];
};

export type EncounterSummary = {
  id: string;
  campaignId: string;
  name: string;
  round: number;
  status: 'active' | 'completed';
  currentCombatantId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
