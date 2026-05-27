import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { HeroNextSession } from '@/components/inicio/hero-next-session';
import { QuickActions } from '@/components/inicio/quick-actions';
import { ActiveCharacterCard } from '@/components/inicio/active-character-card';
import { NovedadesFeed } from '@/components/inicio/novedades-feed';
import { MOCK_NEXT_CAMPAIGN, MOCK_ACTIVE_CHAR, MOCK_NOVEDADES } from '@/components/inicio/mock-data';

export default async function InicioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

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
