import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';

export default async function InicioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <AppShell title="Inicio" subtitle="TU GREMIO">
      <V3Empty
        glyph="home"
        title="Próximamente"
        sub="Tu panel principal vivirá acá."
      />
    </AppShell>
  );
}
