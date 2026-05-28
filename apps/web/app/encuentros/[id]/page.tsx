import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { Pill } from '@/components/ui/pill';
import { RadialDial } from '@/components/encuentros/radial-dial';
import { RosterList } from '@/components/encuentros/roster-row';
import { TurnControlsIsland } from '@/components/encuentros/turn-controls-island';
import type { EncounterDetail } from '@/components/encuentros/types';

type RouteParams = Promise<{ id: string }>;

export default async function EncuentroDetailPage({ params }: { params: RouteParams }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  let detail: EncounterDetail;
  try {
    detail = await api.get<EncounterDetail>(`/encounters/${id}`, token);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  return (
    <AppShell title={detail.name} subtitle="ENCUENTRO" backHref="/encuentros">
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline gap-2">
          <Pill size="sm" tone="pink">Ronda {detail.round}</Pill>
          <Pill size="sm" tone={detail.status === 'active' ? 'green' : 'stone'}>
            {detail.status === 'active' ? 'Activo' : 'Cerrado'}
          </Pill>
        </div>

        <RadialDial
          combatants={detail.combatants}
          currentCombatantId={detail.currentCombatantId}
        />

        <TurnControlsIsland encounterId={detail.id} version={detail.version} />

        <RosterList
          combatants={detail.combatants}
          currentCombatantId={detail.currentCombatantId}
        />
      </div>
    </AppShell>
  );
}
