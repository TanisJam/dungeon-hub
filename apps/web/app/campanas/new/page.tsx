import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { NewCampaignForm } from './_form';

// Next.js 15 async searchParams pattern
export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ worldId?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { worldId } = await searchParams;

  const exitLink = (
    <Link
      href="/campanas"
      className="text-xs font-semibold text-ink-mute hover:text-ink transition-colors"
    >
      ← Salir
    </Link>
  );

  const subtitle = worldId ? 'NUEVA PARTIDA EN ESTE MUNDO' : 'NUEVA CAMPAÑA';
  const hint = worldId
    ? 'Dale un nombre a esta partida. Se creará dentro del mundo activo.'
    : 'Ponele un nombre a tu campaña. Después configurás el mundo, las reglas y a tus jugadores.';

  return (
    <AppShell title="Campañas" subtitle={subtitle} rightAction={exitLink}>
      <p className="text-sm text-ink-mute">{hint}</p>

      <div className="mt-8">
        <NewCampaignForm worldId={worldId} />
      </div>
    </AppShell>
  );
}
