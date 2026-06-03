import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { CODEX_CATEGORY_CONFIG, type CodexKind } from './_config/registry';
import { CodexList } from './_components/codex-list';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodexEnvelope {
  rows: unknown[];
  total: number;
  knownCount: number;
  effectiveView: 'dm' | 'player';
}

interface CharacterLite {
  id: string;
  worldId: string;
}

// ---------------------------------------------------------------------------
// Page — REQ-CCB-WEB-02, REQ-CCB-WEB-03, REQ-CCB-WEB-04
// ---------------------------------------------------------------------------

type Props = {
  params: Promise<{ id: string; kind: string }>;
};

/**
 * Character Codex Category Page — /characters/:id/codex/:kind
 *
 * ADR-2: validates :kind against CODEX_CATEGORY_CONFIG — unknown → notFound() (404).
 * SSR-fetches first 50 rows from /characters/:id/knowledge/:kind.
 * Renders CodexList island with SSR data + charId + worldId.
 *
 * REQ-CCB-WEB-02: list + search, player view (known-only).
 * REQ-CCB-WEB-03: DM view (all + known indicators).
 * REQ-CCB-WEB-04: unknown kind → 404.
 */
export default async function CodexKindPage({ params }: Props) {
  const { id, kind } = await params;

  // REQ-CCB-WEB-04: validate kind against registry — unknown → 404
  if (!(kind in CODEX_CATEGORY_CONFIG)) {
    notFound();
  }
  const validKind = kind as CodexKind;
  const config = CODEX_CATEGORY_CONFIG[validKind];

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  const token = session.access_token;

  // Load character to get worldId (needed for detail scope)
  let character: CharacterLite;
  try {
    const char = await api.get<{ id: string; worldId: string }>(
      `/characters/${id}`,
      token,
    );
    character = { id: char.id, worldId: char.worldId };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 403) {
        return (
          <AppShell title={config.label} constructorHref="/characters/new">
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-ink">No tenés acceso a este personaje.</p>
            </div>
          </AppShell>
        );
      }
    }
    return (
      <AppShell title={config.label} constructorHref="/characters/new">
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-ink">Error al cargar el personaje.</p>
        </div>
      </AppShell>
    );
  }

  // SSR initial fetch — first 50 rows before hydration (REQ-CCB-WEB-02)
  const initialData = await api
    .get<CodexEnvelope>(
      `/characters/${id}/knowledge/${validKind}?limit=50&offset=0`,
      token,
    )
    .catch(() => null);

  const initialRows = initialData?.rows ?? [];
  const total = initialData?.total ?? 0;
  const effectiveView = initialData?.effectiveView ?? 'player';

  return (
    <AppShell title={config.label} subtitle="CÓDEX" constructorHref="/characters/new">
      <CodexList
        kind={validKind}
        charId={id}
        worldId={character.worldId}
        accessToken={token}
        initialRows={initialRows}
        total={total}
        effectiveView={effectiveView}
      />
    </AppShell>
  );
}
