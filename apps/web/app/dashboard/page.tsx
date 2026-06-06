import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { SignOutButton } from '@/app/_components/sign-out-button';
import { AppShell } from '@/components/layout/app-shell';
import { IdentityHeader } from './_identity-header';
import { CharactersSection } from './_characters-section';
import { CampaignsSection } from './_campaigns-section';
import { DevModeToggle } from '@/components/codex/dev-mode-toggle';

type Me = {
  id: string;
  username: string;
  role: 'admin' | 'dm' | 'player';
  discordId: string | null;
  discordUsername: string | null;
  // codex-knowledge B-4 gap closure (#1953): server-resolved devMode for the toggle.
  devMode: boolean;
};

type CharacterRow = {
  id: string;
  worldId: string;
  name: string;
  status: 'active' | 'inactive' | 'dead' | string;
  xp: number;
  updatedAt: string;
};

type CampaignRow = {
  id: string;
  name: string;
  gmUserId: string;
  worldId: string;
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
    <AppShell title="Dungeon Hub" subtitle="TU GREMIO" constructorHref="/characters/new">
      <IdentityHeader
        me={me}
        avatarUrl={avatarUrl}
        signOut={<SignOutButton />}
      />

      <div className="mt-8 flex flex-col gap-10">
        <CharactersSection characters={characters} />
        <CampaignsSection campaigns={campaigns} currentUserId={me.id} />

        {/* Account preferences — codex-knowledge B-4 (#1953): per-user devMode. */}
        <section aria-label="Preferencias">
          <h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-wide text-ink-mute">
            Preferencias
          </h2>
          <div className="rounded-md border border-line bg-surface-raised px-3 py-2">
            <DevModeToggle currentValue={me.devMode} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function FatalError({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError ? `API ${error.status}: ${error.message}` : String(error);
  return (
    <AppShell title="Dungeon Hub" subtitle="TU GREMIO">
      <div className="py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Error al cargar el panel</h1>
        <p className="mt-3 font-mono text-xs text-ink-mute">{message}</p>
      </div>
    </AppShell>
  );
}
