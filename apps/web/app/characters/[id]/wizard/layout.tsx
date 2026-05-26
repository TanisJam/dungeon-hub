import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { Stepper } from '@/components/layout/stepper';
import { Pill } from '@/components/ui';
import { Card } from '@/components/ui';
import { StepSubtitle } from './_step-subtitle';
import { TermProvider } from '@/components/compendium/term';
import { env } from '@/lib/env';

type Character = { id: string; name: string; status: string; worldId: string };

type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  pending_approval: 'Pendiente',
  retired: 'Retirado',
  dead: 'Muerto',
};

const STATUS_TONES: Record<string, 'stone' | 'green' | 'amber' | 'ink'> = {
  draft: 'stone',
  active: 'green',
  pending_approval: 'amber',
  retired: 'ink',
  dead: 'ink',
};

export default async function BuildLayout({ children, params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: { session } } = await supabase.auth.getSession();

  let character: Character;
  try {
    character = await api.get<Character>(`/characters/${id}`, session!.access_token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return (
        <AppShell title="Constructor" constructorHref="/characters/new">
          <Card variant="surface" className="p-6 text-center">
            <p className="text-ink font-semibold">Personaje no encontrado</p>
          </Card>
        </AppShell>
      );
    }
    throw err;
  }

  const statusTone = STATUS_TONES[character.status] ?? 'stone';
  const statusLabel = STATUS_LABELS[character.status] ?? character.status;

  const exitLink = (
    <Link
      href="/dashboard"
      className="text-xs font-semibold text-ink-mute hover:text-ink transition-colors"
    >
      ← Salir
    </Link>
  );

  return (
    <AppShell
      title="Constructor"
      subtitle={<StepSubtitle />}
      rightAction={exitLink}
      constructorHref={`/characters/${id}/wizard`}
    >
      <div className="flex items-center gap-2 mb-4">
        <h1 className="font-display text-xl font-bold text-ink">{character.name}</h1>
        <Pill tone={statusTone} size="sm">{statusLabel}</Pill>
      </div>

      <Stepper characterId={id} />

      <div className="mt-8">
        <TermProvider
          accessToken={session?.access_token}
          worldId={character.worldId}
          apiBaseUrl={env.API_URL}
        >
          {children}
        </TermProvider>
      </div>
    </AppShell>
  );
}
