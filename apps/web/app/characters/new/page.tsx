import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { NewCharacterForm } from './_form';

type CampaignRow = { id: string; name: string };

export default async function NewCharacterPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const { data: { session } } = await supabase.auth.getSession();
  const { data: campaigns } = await api.get<{ data: CampaignRow[] }>(
    '/campaigns',
    session!.access_token,
  );

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
        ← Dashboard
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">New character</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Pick a campaign and name. We&apos;ll set up stats, race, class and background next.
      </p>

      <div className="mt-8">
        {campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">
              You&apos;re not a member of any campaign yet. Ask a GM to add you, or create one
              from the dashboard.
            </p>
          </div>
        ) : (
          <NewCharacterForm campaigns={campaigns} />
        )}
      </div>
    </main>
  );
}
