/**
 * MercadoPage — SSR Server Component for the Mercado surface (Wave 3).
 *
 * REQ-MERC-SURF-01: /mercado route, world-scoped via getActiveCharacter.
 * REQ-MERC-SURF-02: empty states (no active character, no mundane items).
 * REQ-MERC-BROWSE-01: browse-only — no buy/add/equip affordance.
 * ADR-3: mirrors /compendium/[category]/page.tsx pattern; pinned to items + magic=false.
 *
 * Scope resolution: uses getActiveCharacter(token) → worldId (world-scoped, player-facing).
 * This is distinct from the /compendium browser which is campaign-scoped.
 * SSR fetches first 50 mundane items; CompendiumList island handles search/pagination.
 */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { CompendiumList } from '@/app/compendium/[category]/_components/compendium-list';
import { getActiveCharacter } from '@/lib/active-character';

type ListEnvelope = { data: unknown[]; total: number } | null;

/**
 * MercadoPage — authenticated SSR page.
 * Auth → resolve active character (world scope) → SSR fetch mundane items → render list.
 */
export default async function MercadoPage() {
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

  // Resolve active character — carries worldId for the mundane catalog scope.
  // REQ-MERC-SURF-01, ADR-3: world scope (player-facing catalog, not campaign-scoped).
  const activeCharacter = await getActiveCharacter(token);

  // No active character → empty state (REQ-MERC-SURF-02, Scenario: no active campaign)
  if (!activeCharacter) {
    return (
      <AppShell title="Mercado" subtitle="MERCADO">
        <div className="flex flex-col items-center justify-center py-16 text-sm text-ink-soft">
          <p>Seleccioná un personaje para ver el Mercado.</p>
        </div>
      </AppShell>
    );
  }

  const { worldId } = activeCharacter;

  // SSR initial fetch — first 50 mundane items (REQ-MERC-SURF-01, magic=false).
  // Scope: ?world= (world-scoped, consistent with player codex path).
  const initialData = await api
    .get<ListEnvelope>(
      `/compendium/items?world=${worldId}&magic=false&limit=50&offset=0`,
      token,
    )
    .catch(() => null);

  const initialRows = initialData?.data ?? [];
  const total = initialData?.total ?? 0;

  // No mundane items in world → empty state (REQ-MERC-SURF-02, Scenario: no mundane items)
  if (total === 0 && initialRows.length === 0) {
    return (
      <AppShell title="Mercado" subtitle="MERCADO">
        <div className="flex flex-col items-center justify-center py-16 text-sm text-ink-soft">
          <p>No hay artículos disponibles en el Mercado de este mundo.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Mercado" subtitle="MERCADO">
      {/*
        CompendiumList island — reused as-is (REQ-MERC-SURF-01, ADR-3 reuse over rebuild).
        extraFilters={{ magic: 'false' }} pins the mundane filter for client-side search
        and load-more calls via searchCompendium. The SSR fetch already uses magic=false;
        extraFilters ensures the island stays consistent on user interactions.
        REQ-MERC-BROWSE-01: DetailSheet renders ItemHeader only — no buy/add affordance
        (no characterId write context; browse-only path).
      */}
      <CompendiumList
        category="items"
        scope={{ world: worldId }}
        worldId={worldId}
        accessToken={token}
        initialRows={initialRows}
        total={total}
        extraFilters={{ magic: 'false' }}
      />
    </AppShell>
  );
}
