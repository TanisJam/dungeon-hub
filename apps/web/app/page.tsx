import { createClient } from '@/lib/supabase/server';
import { SignInButton } from './_components/sign-in-button';
import { SignOutButton } from './_components/sign-out-button';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-bold tracking-tight">Dungeon Hub</h1>
      <p className="mt-3 text-zinc-400">D&D campaign manager.</p>

      <div className="mt-12">
        {user ? (
          <div className="space-y-3">
            <p className="text-sm">
              Logged in as{' '}
              <span className="font-mono text-zinc-200">
                {user.user_metadata?.full_name ?? user.email ?? user.id}
              </span>
            </p>
            {user.user_metadata?.provider_id && (
              <p className="text-xs text-zinc-500">
                Discord ID: <span className="font-mono">{user.user_metadata.provider_id}</span>
              </p>
            )}
            <SignOutButton />
          </div>
        ) : (
          <SignInButton />
        )}
      </div>
    </main>
  );
}
