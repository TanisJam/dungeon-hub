// _select-board-quests — pure filter/sort for the Tablero de anuncios.
//
// Product vision (recorded, not a formal SDD requirement yet): "Tablero de
// anuncios = capa ACCIONABLE, distinta de la bitácora: convocatorias/misiones.
// El DM saca quests de los rumores. En West Marches el board es cómo los
// jugadores eligen aventuras." This is the basic slice: show what is
// currently on offer, nothing more (no claiming/signup/threading yet).
//
// Kept as a standalone type + function (not imported from
// app/herramientas/quests/actions.ts) so this player-facing surface does not
// couple to the DM tools route, and so the pure logic is trivially testable
// apart from the Server Component.

export type BoardQuestStatus = 'available' | 'active' | 'completed' | 'abandoned';

export type BoardQuest = {
  id: string;
  title: string;
  description: string | null;
  status: BoardQuestStatus;
  updatedAt: string;
};

// Only 'available' and 'active' quests are live announcements. 'completed'
// and 'abandoned' quests are history, not something a player can still take
// up — they belong to the bitácora/log, not the board.
const ANNOUNCED_STATUSES: ReadonlySet<BoardQuestStatus> = new Set(['available', 'active']);

// available sorts before active within the announced set.
const STATUS_ORDER: Record<'available' | 'active', number> = { available: 0, active: 1 };

export type AnnouncedQuest = BoardQuest & { status: 'available' | 'active' };

/**
 * selectBoardQuests — filters to quests currently on offer and orders them
 * for display: 'available' before 'active', then most recently updated first.
 *
 * Visibility (public vs dm-only) is NOT re-checked here: GET
 * /worlds/:worldId/quests already runs filterQuestsByAccess server-side
 * (apps/api/src/http/routes/quests.ts), so a player-scoped fetch never
 * receives dm-only quests in the first place.
 */
export function selectBoardQuests(quests: BoardQuest[]): AnnouncedQuest[] {
  return quests
    .filter((quest): quest is AnnouncedQuest => ANNOUNCED_STATUSES.has(quest.status))
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}
