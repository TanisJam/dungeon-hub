import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyWorlds } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui';
import { NewCharacterForm } from './_form';

export default async function NewCharacterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: { session } } = await supabase.auth.getSession();

  // Parallelize worlds fetch + active world resolution (ADR-A5: gate at call site).
  const [worlds, activeWorld] = await Promise.all([
    getMyWorlds(session!.access_token),
    getActiveWorld(session!.access_token),
  ]);

  const exitLink = (
    <Link
      href="/inicio"
      className="text-xs font-semibold text-ink-mute hover:text-ink transition-colors"
    >
      ← Salir
    </Link>
  );

  return (
    <AppShell
      title="Constructor"
      subtitle="NUEVO PERSONAJE"
      rightAction={exitLink}
      constructorHref="/characters/new"
      callerRole={activeWorld?.callerRole ?? undefined}
    >
      <p className="text-sm text-ink-mute">
        Elegí un mundo y un nombre. Después configuramos atributos, linaje, clase y trasfondo.
      </p>

      <div className="mt-8">
        {worlds.length === 0 ? (
          <Card variant="surface" className="px-4 py-8 text-center">
            <p className="text-sm text-ink-mute">
              No tenés worlds asignados. Pedile al DM que te invite.
            </p>
          </Card>
        ) : (
          <NewCharacterForm worlds={worlds} />
        )}
      </div>
    </AppShell>
  );
}
