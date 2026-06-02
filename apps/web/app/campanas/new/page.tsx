import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { NewCampaignForm } from './_form';

export default async function NewCampaignPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const exitLink = (
    <Link
      href="/campanas"
      className="text-xs font-semibold text-ink-mute hover:text-ink transition-colors"
    >
      ← Salir
    </Link>
  );

  return (
    <AppShell title="Campañas" subtitle="NUEVA CAMPAÑA" rightAction={exitLink}>
      <p className="text-sm text-ink-mute">
        Ponele un nombre a tu campaña. Después configurás el mundo, las reglas y a tus jugadores.
      </p>

      <div className="mt-8">
        <NewCampaignForm />
      </div>
    </AppShell>
  );
}
