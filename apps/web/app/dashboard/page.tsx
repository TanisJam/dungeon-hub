import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { SignOutButton } from '@/app/_components/sign-out-button';
import { IdentityHeader } from './_identity-header';
import { CharactersSection } from './_characters-section';
import { CampaignsSection } from './_campaigns-section';

type Me = {
  id: string;
  username: string;
  role: 'admin' | 'dm' | 'player';
  discordId: string | null;
  discordUsername: string | null;
};

type CharacterRow = {
  id: string;
  campaignId: string;
  name: string;
  status: 'active' | 'inactive' | 'dead' | string;
  xp: number;
  updatedAt: string;
};

type CampaignRow = {
  id: string;
  name: string;
  gmUserId: string;
  memberRole: 'gm' | 'player';
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session!.access_token;

  const [meResult, charactersResult, campaignsResult] = await Promise.allSettled([
    api.get<Me>('/auth/me', token),
    api.get<{ data: CharacterRow[] }>('/characters', token),
    api.get<{ data: CampaignRow[] }>('/campaigns', token),
  ]);

  if (meResult.status === 'rejected') {
    return <FatalError error={meResult.reason} />;
  }
  const me = meResult.value;
  const characters = charactersResult.status === 'fulfilled' ? charactersResult.value.data : [];
  const campaigns = campaignsResult.status === 'fulfilled' ? campaignsResult.value.data : [];

  const avatarUrl = (user.user_metadata?.avatar_url ?? user.user_metadata?.picture) as
    | string
    | undefined;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <IdentityHeader
        me={me}
        avatarUrl={avatarUrl}
        signOut={<SignOutButton />}
      />

      <div className="mt-12 grid gap-12 md:grid-cols-2">
        <CharactersSection characters={characters} />
        <CampaignsSection campaigns={campaigns} currentUserId={me.id} />
      </div>
    </main>
  );
}

function FatalError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError ? `API ${error.status}: ${error.message}` : String(error);
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold text-red-400">Failed to load dashboard</h1>
      <p className="mt-3 font-mono text-sm text-zinc-400">{message}</p>
    </main>
  );
}
