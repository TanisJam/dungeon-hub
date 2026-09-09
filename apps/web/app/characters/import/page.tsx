import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyWorlds } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui';
import { ImportCharacterForm } from './_form';

// Character re-import entry point (inverse of ../[id]/_export-button.tsx's
// export). Lives at /characters/import rather than under a specific
// character — importing creates a brand-new character, it doesn't act on an
// existing one, so it sits alongside /characters/new as the other way to add
// a character to the roster. Reached from a CTA on /personajes (the roster).
export default async function ImportCharacterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const worlds = await getMyWorlds(session!.access_token);

  return (
    <AppShell title="Importar personaje" subtitle="DESDE UN ARCHIVO" backHref="/personajes">
      <p className="text-sm text-ink-mute">
        Subí el archivo .json que exportaste desde otra ficha. El personaje entra
        como borrador y todavía necesita la aprobación de tu DM antes de poder
        jugarlo.
      </p>

      <div className="mt-8">
        {worlds.length === 0 ? (
          <Card variant="surface" className="px-4 py-8 text-center">
            <p className="text-sm text-ink-mute">
              No tenés worlds asignados. Pedile al DM que te invite.
            </p>
          </Card>
        ) : (
          <ImportCharacterForm worlds={worlds} />
        )}
      </div>
    </AppShell>
  );
}
