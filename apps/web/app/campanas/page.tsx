import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';

export default async function CampanasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <AppShell title="Campañas" subtitle="TUS AVENTURAS">
      <V3Empty
        glyph="compass"
        title="Próximamente"
        sub="Pronto vas a verlo acá."
      />
    </AppShell>
  );
}
