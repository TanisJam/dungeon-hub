export type CombatantKind = 'pc' | 'npc';

export type CombatantCondition = {
  name: string;
  appliedByCombatantId: string | null;
};

export type CombatantEffect = {
  name: string;
  sourceCombatantId: string | null;
};

export type EncounterCombatant = {
  id: string;
  name: string;
  kind: CombatantKind;
  characterId: string | null;
  initiative: number;
  hpCurrent: number;
  hpMax: number;
  // FIX-3 (WARNING): ac mirrors the API shape from load-encounter.ts which returns ac
  // for NPC combatants (REQ-AC-CREATE-01). Optional/null for PC combatants.
  ac?: number | null;
  insertionOrder: number;
  // REQ-WCO-API-03 — conditions/effects (PHB Appendix A p.290-292) + action economy
  conditions: CombatantCondition[];
  effects: CombatantEffect[];
  actionUsed: boolean;
  bonusActionUsed: boolean;
  reactionUsed: boolean;
  attacksRemaining: number;
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
  // REQ-WCO-WEB-08: caller-specific role returned by GET /encounters/:id.
  // Used by the web client to gate GM-only controls (e.g. TurnControlsIsland).
  callerRole: 'gm' | 'player';
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
