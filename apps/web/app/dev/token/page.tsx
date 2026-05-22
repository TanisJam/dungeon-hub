import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui';
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
    <main className="mx-auto max-w-sm px-4 py-8">
      <h1 className="font-display text-xl font-bold text-ink">Dev: access token</h1>
      <p className="mt-2 text-sm text-ink-mute">
        Para usar en scripts via <code className="font-mono text-ink-soft">TEST_JWT=…</code>.
      </p>
      <CopyTokenButton token={token} />
      <Card variant="surface-soft" className="mt-4 p-4">
        <pre className="max-h-72 overflow-auto text-xs text-ink-soft font-mono break-all whitespace-pre-wrap">
          {token}
        </pre>
      </Card>
    </main>
  );
}
