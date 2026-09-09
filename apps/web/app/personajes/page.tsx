import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, getMyWorlds } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';
import { PersonajeCard, StatusFilterChips, CreatePersonajeCTA, ImportPersonajeCTA } from '@/components/personajes';
import type { RosterCharacter } from '@/components/personajes/types';
import { parseChip, filterByStatusChip, computeCounts } from '@/lib/personajes-filter';
import { getActiveCharacter } from '@/lib/active-character';

type SearchParams = Promise<{ status?: string }>;

export default async function PersonajesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  const [charsResult, worldsResult, activeCharResult] = await Promise.allSettled([
    api.get<{ data: RosterCharacter[] }>('/characters', token),
    getMyWorlds(token),
    getActiveCharacter(token),
  ]);

  const characters: RosterCharacter[] =
    charsResult.status === 'fulfilled' ? charsResult.value.data : [];
  const worlds = worldsResult.status === 'fulfilled' ? worldsResult.value : [];
  const worldsMap = Object.fromEntries(worlds.map((w) => [w.id, w.name]));
  const activeCharacterId =
    activeCharResult.status === 'fulfilled' ? (activeCharResult.value?.id ?? null) : null;

  const { status } = await searchParams;
  const chip = parseChip(status);
  const counts = computeCounts(characters);
  const visible = filterByStatusChip(characters, chip);

  const emptyTitle =
    chip === 'pending'
      ? 'Sin pendientes'
      : chip === 'retired'
        ? 'Sin retirados'
        : chip === 'draft'
          ? 'Sin borradores'
          : 'Sin personajes';

  return (
    <AppShell title="Personajes" subtitle="TU ROSTER">
      <div className="flex flex-col gap-4">
        <StatusFilterChips counts={counts} />
        {visible.length === 0 ? (
          <V3Empty
            glyph="user"
            title={emptyTitle}
            sub="Cuando tu DM apruebe tu próxima ficha, va a aparecer acá."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visible.map((c) => (
              <PersonajeCard
                key={c.id}
                char={c}
                worldName={worldsMap[c.worldId]}
                activeCharacterId={activeCharacterId ?? undefined}
                highlight={c.id === activeCharacterId}
              />
            ))}
          </div>
        )}
        <CreatePersonajeCTA />
        <ImportPersonajeCTA />
      </div>
    </AppShell>
  );
}
