import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRole } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { HeroNextSession } from '@/components/inicio/hero-next-session';
import { QuickActions } from '@/components/inicio/quick-actions';
import { ActiveCharacterCard } from '@/components/inicio/active-character-card';
import { NovedadesFeed } from '@/components/inicio/novedades-feed';
import { MOCK_NEXT_CAMPAIGN, MOCK_ACTIVE_CHAR, MOCK_NOVEDADES } from '@/components/inicio/mock-data';
import { PendingFichasCardTrigger } from '@/components/inicio/dm/pending-fichas-card-trigger';
import { DMNextSessionCard } from '@/components/inicio/dm/dm-next-session-card';
import { DMQuickActions } from '@/components/inicio/dm/dm-quick-actions';
import { QuestsSinTocarList } from '@/components/inicio/dm/quests-sin-tocar-list';
import {
  MOCK_PENDING_FICHAS,
  MOCK_PENDING_OLDEST_AGE,
  MOCK_DM_NEXT_CAMPAIGN,
  MOCK_QUESTS_SIN_TOCAR,
} from '@/components/inicio/dm-mock-data';

export default async function InicioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const role = await getRole();

  if (role === 'dm') {
    return (
      <AppShell title="Inicio" subtitle="TU GREMIO — DM">
        <div className="flex flex-col gap-4">
          <PendingFichasCardTrigger
            fichas={MOCK_PENDING_FICHAS}
            oldestAge={MOCK_PENDING_OLDEST_AGE}
            quests={MOCK_QUESTS_SIN_TOCAR}
          />
          <DMNextSessionCard campaign={MOCK_DM_NEXT_CAMPAIGN} />
          <DMQuickActions />
          <QuestsSinTocarList quests={MOCK_QUESTS_SIN_TOCAR} />
        </div>
      </AppShell>
    );
  }

  // Default: player tree (unchanged)
  return (
    <AppShell title="Inicio" subtitle="TU GREMIO">
      <div className="flex flex-col gap-4">
        <HeroNextSession campaign={MOCK_NEXT_CAMPAIGN} />
        <QuickActions />
        <ActiveCharacterCard char={MOCK_ACTIVE_CHAR} />
        <NovedadesFeed items={MOCK_NOVEDADES} />
      </div>
    </AppShell>
  );
}
