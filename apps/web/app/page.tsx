import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CrowMark } from '@/components/ui';
import { SignInButton } from './_components/sign-in-button';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <main className="mx-auto max-w-sm px-4 py-16 flex flex-col items-center text-center">
      <div className="mb-6">
        <CrowMark />
      </div>

      <h1 className="font-display text-4xl font-bold tracking-tight text-ink">
        Dungeon Hub
      </h1>
      <p className="mt-3 text-sm text-ink-mute">
        Tu gremio en un solo lugar.
      </p>

      <div className="mt-10 w-full">
        <SignInButton redirectTo="/dashboard" />
      </div>
    </main>
  );
}
