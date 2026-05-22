import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { Stepper } from './_stepper';

type Character = { id: string; name: string; status: string; campaignId: string };

type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

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
        <main className="mx-auto max-w-2xl px-6 py-24">
          <h1 className="text-2xl font-semibold text-red-400">Character not found</h1>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-indigo-400">
            ← Dashboard
          </Link>
        </main>
      );
    }
    throw err;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Dashboard
      </Link>

      <header className="mt-3 flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{character.name}</h1>
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300 ring-1 ring-inset ring-amber-500/30">
          {character.status}
        </span>
      </header>

      <Stepper characterId={id} />

      <div className="mt-10">{children}</div>
    </main>
  );
}
