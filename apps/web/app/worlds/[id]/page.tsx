/**
 * /worlds/[id] — DM session panel landing page.
 *
 * SDD dm-session-panel — REQ-WDCL-WEB-LANDING (spec #857). Server Component
 * that reads `searchParams.status`, fetches world detail + character list in
 * parallel via the api helper, and renders a mobile-first segmented control
 * + vertical list. Default tab: Pendientes (status=pending_approval).
 *
 * Non-member → 403 from api → redirect to /dashboard.
 * Mobile-first: 375px viewport scrolls vertically only, all tap targets ≥44px.
 */
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { Card } from '@/components/ui';
import { StatusTabs } from './_components/status-tabs';
import { CharacterRow, type ListedWorldCharacter } from './_components/character-row';

type WorldDetail = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  callerRole: 'gm' | 'player' | null;
};

type CharactersResponse = { characters: ListedWorldCharacter[] };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
};

const DEFAULT_STATUS_PARAM = 'pending_approval';

export default async function WorldLandingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { status: statusFromUrl } = await searchParams;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');
  const token = session.access_token;

  // Default tab: Pendientes. The URL may omit ?status= (Todos) → empty filter.
  // Convention: `statusFromUrl === undefined` ⇒ first visit → default to pending.
  // Explicit empty (e.g. /worlds/[id]?status=) is not meaningful in our nav so
  // we treat it the same as undefined.
  const isFirstVisit = statusFromUrl === undefined;
  const statusForApi = isFirstVisit ? DEFAULT_STATUS_PARAM : statusFromUrl;

  const charactersPath = statusForApi
    ? `/worlds/${id}/characters?status=${encodeURIComponent(statusForApi)}`
    : `/worlds/${id}/characters`;

  let world: WorldDetail;
  let characters: ListedWorldCharacter[];
  try {
    const [worldRes, charactersRes] = await Promise.all([
      api.get<WorldDetail>(`/worlds/${id}`, token),
      api.get<CharactersResponse>(charactersPath, token),
    ]);
    world = worldRes;
    characters = charactersRes.characters;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 403) redirect('/dashboard');
    }
    return (
      <AppShell title="Mundo" constructorHref="/characters/new">
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-ink">Error al cargar el mundo.</p>
        </div>
      </AppShell>
    );
  }

  // Pass the *effective* status param to StatusTabs so the active tab matches
  // what the server actually fetched. On first visit, that's `pending_approval`.
  const effectiveStatusParam = isFirstVisit ? DEFAULT_STATUS_PARAM : statusFromUrl;

  return (
    <AppShell title={world.name} subtitle="PANEL DE MAESTRO" constructorHref="/characters/new">
      <div className="space-y-4">
        <StatusTabs worldId={id} currentStatusParam={effectiveStatusParam} />

        {characters.length === 0 ? (
          <Card variant="surface" className="px-4 py-10 text-center">
            <p className="text-sm text-ink-mute">Sin personajes en este estado.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {characters.map((c) => (
              <CharacterRow key={c.id} character={c} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
