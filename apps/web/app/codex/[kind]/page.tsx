import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveCharacter } from '@/lib/active-character';
import { AppShell } from '@/components/layout/app-shell';
import { CATEGORY_CONFIG } from '@/app/compendium/[category]/_config/registry';
import { CompendiumList } from '@/app/compendium/[category]/_components/compendium-list';
import type { CompendiumCategory } from '@/app/compendium/_components/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ListEnvelope = { data: unknown[]; total: number } | null;

// ---------------------------------------------------------------------------
// Page — ADR-1 (world-scoped compendium), ADR-3 (CATEGORY_CONFIG reuse)
// codex-rehome: player [kind] category page
//
// Namespace safety (REQ-KIND-03 / ADR-3): static routes (/codex/facciones,
// /codex/npcs) are NOT in CATEGORY_CONFIG, so any request for those slugs
// returns notFound() here. App Router static-segment precedence further
// guarantees the static pages win over this dynamic [kind] segment — but the
// CATEGORY_CONFIG guard is a belt-and-suspenders defense.
// ---------------------------------------------------------------------------

interface KindPageProps {
  params: Promise<{ kind: string }>;
}

/**
 * CodexKindPage — player compendium list scoped to active character's world.
 * ADR-1: reuses global CompendiumList in {world} mode — full, unfiltered.
 * ADR-3: validates kind against CATEGORY_CONFIG (all 6 categories); unknown → 404.
 * REQ-KIND-01: renders the same dataset as /compendium/{kind}, just world-scoped.
 * REQ-KIND-02: worldId sourced from getActiveCharacter(token).worldId (no URL exposure).
 * REQ-KIND-03: facciones/npcs not in CATEGORY_CONFIG → notFound() (and static wins anyway).
 */
export default async function CodexKindPage({ params }: KindPageProps) {
  const { kind } = await params;

  // ADR-3: validate kind against the 6-category registry (REQ-KIND-03)
  if (!(kind in CATEGORY_CONFIG)) {
    notFound();
  }

  const config = CATEGORY_CONFIG[kind as CompendiumCategory];

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session!.access_token;

  // REQ-KIND-02: worldId from active character — no URL param exposed
  const activeChar = await getActiveCharacter(token);
  if (!activeChar) {
    // No active character: render a minimal empty state inside the shell
    return (
      <AppShell title={config.label} subtitle="CÓDEX">
        <div className="flex flex-col items-center justify-center py-16 text-sm text-ink-soft">
          <p>Seleccioná un personaje activo para ver este listado.</p>
        </div>
      </AppShell>
    );
  }

  const { worldId } = activeChar;

  // SSR initial fetch — first 50 rows before hydration (REQ-KIND-01 parity with /compendium)
  const initialData = await api
    .get<ListEnvelope>(
      `/compendium/${config.endpoint}?world=${worldId}&limit=50&offset=0`,
      token,
    )
    .catch(() => null);

  const initialRows = initialData?.data ?? [];
  const total = initialData?.total ?? 0;

  return (
    <AppShell title={config.label} subtitle="CÓDEX">
      <CompendiumList
        category={kind as CompendiumCategory}
        scope={{ world: worldId }}
        worldId={worldId}
        accessToken={token}
        initialRows={initialRows}
        total={total}
      />
    </AppShell>
  );
}
