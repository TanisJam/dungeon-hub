/**
 * Shared display types for the /inicio home widgets.
 * Previously lived in mock-data.ts and dm-mock-data.ts.
 */

export type NextCampaign = {
  id: string;
  name: string;
  /** Optional — no backend field; omit when not available. */
  tagline?: string;
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
  /** Optional — no backend field; omit when not available. */
  tagline?: string;
  nextSession: string;   // e.g. "VIE 21:30"
  players: number;
  /** Optional — no backend field; omit when not available. */
  pendingQuests?: number;
  sessions: number;      // sessions played so far → next is sessions + 1
};

export type QuestSinTocar = {
  id: string;
  title: string;
  lastChange: string;    // e.g. "hace 3 días"
};
