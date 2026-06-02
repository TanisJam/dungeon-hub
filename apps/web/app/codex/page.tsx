import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui/empty';

/**
 * Codex — placeholder stub (REQ-WIS-06, Slice 2).
 * Part 3 will fill this with the world codex / lore surface.
 */
export default async function CodexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  return (
    <AppShell title="Codex" subtitle="DEL MUNDO">
      <V3Empty
        glyph="book"
        title="Próximamente — Parte 3"
        sub="El codex del mundo llegará en la siguiente actualización."
      />
    </AppShell>
  );
}
