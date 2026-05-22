import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { Stepper } from '@/components/layout/stepper';
import { Pill } from '@/components/ui';
import { Card } from '@/components/ui';

type Character = { id: string; name: string; status: string; campaignId: string };

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
        <main className="mx-auto max-w-sm px-4 py-16">
          <Card variant="surface" className="p-6 text-center">
            <p className="text-ink font-semibold">Personaje no encontrado</p>
            <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary-deep hover:underline">
              ← Inicio
            </Link>
          </Card>
        </main>
      );
    }
    throw err;
  }

  const statusLabel = STATUS_LABELS[character.status] ?? character.status;
  const statusTone = STATUS_TONES[character.status] ?? 'stone';

  return (
    <main className="mx-auto max-w-sm px-4 py-6">
      <Link href="/dashboard" className="text-xs text-ink-mute hover:text-ink-soft transition">
        ← Inicio
      </Link>

      <header className="mt-3 flex items-center gap-2">
        <h1 className="font-display text-xl font-bold text-ink">{character.name}</h1>
        <Pill tone={statusTone} size="sm">{statusLabel}</Pill>
      </header>

      <div className="mt-4">
        <Stepper characterId={id} />
      </div>

      <div className="mt-8">{children}</div>
    </main>
  );
}
