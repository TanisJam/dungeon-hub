import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveCharacter } from '@/lib/active-character';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { CATEGORY_CONFIG } from '@/app/compendium/[category]/_config/registry';
import { CompendiumList } from '@/app/compendium/[category]/_components/compendium-list';
import { CodexList } from '@/app/characters/[id]/codex/[kind]/_components/codex-list';
import type { CompendiumCategory } from '@/app/compendium/_components/types';
import { familyOf } from '@dungeon-hub/domain/world/codex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Reference path: GET /compendium/{endpoint}?world=... → { data: Row[], total, limit, offset }
// Confirmed from compendium route handler (HARD RULE #1932).
type ReferenceEnvelope = { data: unknown[]; total: number } | null;

// World-knowledge path: GET /characters/:id/knowledge/:kind → { rows, total, knownCount, effectiveView }
// Confirmed from characters.ts:1835-1840, read-character-codex.ts:63-68 (HARD RULE #1932).
type KnowledgeEnvelope = {
  rows: unknown[];
  total: number;
  knownCount: number;
  effectiveView: 'dm' | 'player';
} | null;

// Valid CodexKind values for the world-knowledge path.
// Mirrors CodexKind in apps/api/src/use-cases/characters/read-character-codex.ts.
const WORLD_KNOWLEDGE_KINDS = ['monsters', 'npcs', 'factions', 'locations', 'lore'] as const;
type WorldKnowledgeKind = typeof WORLD_KNOWLEDGE_KINDS[number];

function isWorldKnowledgeKind(kind: string): kind is WorldKnowledgeKind {
  return (WORLD_KNOWLEDGE_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// Page — codex-knowledge B-1 routing split
//
// ADR-3 (codex-rehome): validates kind against CATEGORY_CONFIG OR WORLD_KNOWLEDGE_KINDS.
// FORK 2 (#1944): reference family → unfiltered compendium endpoint (unchanged behavior).
//                 world-knowledge family → gated /characters/:id/knowledge/:kind endpoint.
// HARD RULE #1932: TWO DIFFERENT envelopes — branch on familyOf(kind) FIRST, parse matching shape.
// ADR-2 Option A (#1946): monsters fully wired; npcs/factions/locations/lore → gated-EMPTY.
// REQ-CK-GATE-08, REQ-CK-GATE-09.
// ---------------------------------------------------------------------------

interface KindPageProps {
  params: Promise<{ kind: string }>;
}

export default async function CodexKindPage({ params }: KindPageProps) {
  const { kind } = await params;

  const family = familyOf(kind);

  // Unknown kind (not reference, not world-knowledge) → 404
  if (!family) {
    notFound();
  }

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
    // No active character — render graceful empty state inside the shell.
    // This matches the existing pattern (FORK 3 — no new tab, same AppShell).
    const title = family === 'reference'
      ? (CATEGORY_CONFIG[kind as CompendiumCategory]?.label ?? kind)
      : capitalizeKind(kind);
    return (
      <AppShell title={title} subtitle="CÓDEX" backHref="/codex">
        <div className="flex flex-col items-center justify-center py-16 text-sm text-ink-soft">
          <p>Seleccioná un personaje activo para ver este listado.</p>
        </div>
      </AppShell>
    );
  }

  const { worldId } = activeChar;

  // ── REFERENCE family (spells, items, classes, races, backgrounds, feats, conditions) ──
  // Unchanged behavior: call unfiltered /compendium/{endpoint}?world= → parse { data, total }.
  // Reference envelope shape confirmed: { data: Row[], total, limit, offset }.
  if (family === 'reference') {
    if (!(kind in CATEGORY_CONFIG)) {
      notFound();
    }
    const config = CATEGORY_CONFIG[kind as CompendiumCategory];

    const initialData = await api
      .get<ReferenceEnvelope>(
        `/compendium/${config.endpoint}?world=${worldId}&limit=50&offset=0`,
        token,
      )
      .catch(() => null);

    const initialRows = initialData?.data ?? [];
    const total = initialData?.total ?? 0;

    return (
      <AppShell title={config.label} subtitle="CÓDEX" backHref="/codex">
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

  // ── WORLD-KNOWLEDGE family (monsters, npcs, factions, locations, lore) ──
  // New gated routing: call /characters/:id/knowledge/:kind → parse { rows, total, knownCount, effectiveView }.
  // Knowledge envelope shape confirmed: { rows: Row[], total, knownCount, effectiveView }.
  // ADR-2: monsters fully wired (real data); npcs/factions/locations/lore → gated-empty from API.
  // REQ-CK-GATE-09: empty state renders without error when rows=[] (common post-split case).
  if (!isWorldKnowledgeKind(kind)) {
    notFound();
  }

  const knowledgeKind = kind as WorldKnowledgeKind;
  const title = WORLD_KNOWLEDGE_LABELS[knowledgeKind] ?? capitalizeKind(knowledgeKind);

  // Forward the GM "preview as player" toggle to the API: the API can't read the
  // dh:role cookie (web→API is Bearer-only), so we pass ?view=player as a safe
  // downgrade. Omitted otherwise → API returns the caller's max view (unchanged).
  const viewPref = await getViewPreference();
  const viewParam = viewPref === 'player' ? '&view=player' : '';

  const initialData = await api
    .get<KnowledgeEnvelope>(
      `/characters/${activeChar.id}/knowledge/${knowledgeKind}?limit=50&offset=0${viewParam}`,
      token,
    )
    .catch(() => null);

  // Fail-safe: default to restrictive player view on fetch error (design §4.6).
  const initialRows = initialData?.rows ?? [];
  const total = initialData?.total ?? 0;
  const effectiveView = initialData?.effectiveView ?? 'player';

  return (
    <AppShell title={title} subtitle="CÓDEX" backHref="/codex">
      <CodexList
        kind={knowledgeKind}
        charId={activeChar.id}
        worldId={worldId}
        accessToken={token}
        initialRows={initialRows}
        total={total}
        effectiveView={effectiveView}
      />
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Display labels for world-knowledge kinds (mobile-first, Spanish UI). */
const WORLD_KNOWLEDGE_LABELS: Record<WorldKnowledgeKind, string> = {
  monsters: 'Monstruos',
  npcs: 'PNJs',
  factions: 'Facciones',
  locations: 'Lugares',
  lore: 'Tradición',
};

function capitalizeKind(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
