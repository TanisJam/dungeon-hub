import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';

export default async function EncuentrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <AppShell title="Encuentros" subtitle="TUS COMBATES">
      <V3Empty
        glyph="sword"
        title="Próximamente"
        sub="Pronto vas a verlo acá."
      />
    </AppShell>
  );
}
