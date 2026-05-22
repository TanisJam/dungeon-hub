import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CopyTokenButton } from './_copy-button';

// Dev-only route: muestra el access_token del usuario actual para seeding/scripts.
// Eliminar antes de prod (o gatear por NODE_ENV).
export default async function DevTokenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: { session } } = await supabase.auth.getSession();
  const token = session!.access_token;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-xl font-semibold">Dev: access token</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Para usar en scripts via <code className="text-zinc-300">TEST_JWT=…</code>.
      </p>
      <CopyTokenButton token={token} />
      <pre className="mt-4 max-h-72 overflow-auto rounded-md bg-zinc-900 p-4 text-xs text-zinc-300">
        {token}
      </pre>
    </main>
  );
}
