import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SignInButton } from './_components/sign-in-button';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">Dungeon Hub</h1>
      <p className="mt-3 text-zinc-400">D&D campaign manager.</p>

      <div className="mt-12">
        <SignInButton redirectTo="/dashboard" />
      </div>
    </main>
  );
}
