/**
 * TableroPage — SSR Server Component for the Tablero de anuncios (Wave: first slice).
 *
 * Product vision (recorded, not invented): "Tablero de anuncios = capa
 * ACCIONABLE, distinta de la bitácora: convocatorias/misiones. El DM saca
 * quests de los rumores. En West Marches el board es cómo los jugadores
 * eligen aventuras." This is deliberately the basic version: players see the
 * adventures currently on offer — no claiming, no signup, no threading.
 *
 * Structure copied from /mercado/page.tsx (closest sibling: player-facing,
 * world-scoped via the active character).
 *
 * Scope resolution: uses getActiveCharacter(token) → worldId, same as Mercado.
 *
 * No new schema, no new API: reuses GET /worlds/:worldId/quests, which already
 * runs filterQuestsByAccess server-side, so dm-only quests never reach a
 * player here — see the comment on selectBoardQuests in
 * ./_select-board-quests.ts for why this page does not re-filter visibility.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { QuestRow } from '@/components/ui/quest-row';
import { getActiveCharacter } from '@/lib/active-character';
import { selectBoardQuests, type AnnouncedQuest, type BoardQuest } from './_select-board-quests';

type QuestListEnvelope = { data: BoardQuest[] };

const STATUS_LABEL: Record<'available' | 'active', string> = {
  available: 'Disponible',
  active: 'En curso',
};

/** Relative age string from ISO updatedAt, e.g. "hace 2 horas", "hace 3 días". */
function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const weeks = Math.floor(days / 7);
  return `hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
}

/** Status label in Spanish + a useful detail (description, or last update). */
function buildSubtitle(quest: AnnouncedQuest): string {
  const label = STATUS_LABEL[quest.status];
  const detail = quest.description?.trim() || relativeAge(quest.updatedAt);
  return `${label} · ${detail}`;
}

/**
 * TableroPage — authenticated SSR page.
 * Auth → resolve active character (world scope) → SSR fetch quests → render board.
 */
export default async function TableroPage() {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  // Resolve active character — carries worldId for the quest board scope.
  const activeCharacter = await getActiveCharacter(token);

  // No active character → empty state (same shape as Mercado).
  if (!activeCharacter) {
    return (
      <AppShell title="Tablero" subtitle="ANUNCIOS">
        <div className="flex flex-col items-center justify-center py-16 text-sm text-ink-soft">
          <p>Seleccioná un personaje para ver el Tablero.</p>
        </div>
      </AppShell>
    );
  }

  const { worldId } = activeCharacter;

  // SSR fetch — degrades to an empty list on failure rather than throwing,
  // same pattern as apps/web/app/herramientas/quests/page.tsx.
  let quests: BoardQuest[] = [];
  try {
    const res = await api.get<QuestListEnvelope>(`/worlds/${worldId}/quests`, token);
    quests = res.data ?? [];
  } catch {
    // Fetch failed — render the empty state rather than a 500.
  }

  const board = selectBoardQuests(quests);

  // No convocatorias on offer → empty state.
  if (board.length === 0) {
    return (
      <AppShell title="Tablero" subtitle="ANUNCIOS">
        <div className="flex flex-col items-center justify-center py-16 text-sm text-ink-soft">
          <p>No hay convocatorias disponibles en este mundo.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Tablero" subtitle="ANUNCIOS">
      <ul className="mt-2 flex flex-col gap-2">
        {board.map((quest) => (
          <QuestRow key={quest.id} title={quest.title} subtitle={buildSubtitle(quest)} />
        ))}
      </ul>
    </AppShell>
  );
}
