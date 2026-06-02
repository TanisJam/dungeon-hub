import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';

/**
 * Mapa — placeholder stub (REQ-WIS-06, Slice 2).
 * Part 3 will fill this with the world map surface.
 */
export default async function MapaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <AppShell title="Mapa" subtitle="DEL MUNDO">
      <V3Empty
        glyph="feather"
        title="Próximamente — Parte 3"
        sub="El mapa del mundo llegará en la siguiente actualización."
      />
    </AppShell>
  );
}
