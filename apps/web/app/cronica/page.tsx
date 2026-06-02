import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';

/**
 * Crónica — placeholder stub (REQ-WIS-06, Slice 2).
 * Part 3 will fill this with the world chronicle / session log surface.
 */
export default async function CronicaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <AppShell title="Crónica" subtitle="DEL MUNDO">
      <V3Empty
        glyph="scroll"
        title="Próximamente — Parte 3"
        sub="La crónica del mundo llegará en la siguiente actualización."
      />
    </AppShell>
  );
}
