import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';

export default async function CompendiumPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <AppShell title="Compendium" subtitle="REGLAS Y OBJETOS">
      <V3Empty
        glyph="book"
        title="Próximamente"
        sub="Pronto vas a verlo acá."
      />
    </AppShell>
  );
}
