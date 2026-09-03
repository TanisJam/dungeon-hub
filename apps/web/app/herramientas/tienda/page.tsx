import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { V3Empty } from '@/components/ui';
import { HERRAMIENTAS_SUBNAV_ITEMS } from '../_components/subnav-items';
import { ShopCurationEditor, type ShopItemRef } from './_components/shop-curation-editor';

/**
 * Tienda — Server Component (market-shop-dm-stock-web, sub-slice 3d).
 *
 * Role self-gate: if effectiveView !== 'dm' → notFound() (REQ-DMTOOLS-02, ADR-2).
 * Resolves active world + view preference in parallel (canonical herramientas pattern).
 *
 * SSR-fetches ALL mundane items for the active world (no `forSale` filter — the DM
 * sees the full mundane catalog to curate, unlike Mercado which filters by it) and
 * the world's current `rulesProfile.shopCuration`; renders SubNav + the
 * ShopCurationEditor client island.
 */

type ItemsListEnvelope = { data: ShopItemRef[]; total: number } | null;

interface WorldDetailWithRulesProfile {
  id: string;
  rulesProfile: { shopCuration?: { enabled: boolean; forSale: string[] } };
}

export default async function TiendaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Resolve active world + view preference in parallel (canonical herramientas pattern).
  const [aw, viewPref] = await Promise.all([getActiveWorld(token), getViewPreference()]);

  // Canonical effectiveView formula (REQ-WIS-08)
  const effectiveView =
    aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  // REQ-DMTOOLS-02: DM-only route — player gets notFound (default-deny, ADR-2)
  if (effectiveView !== 'dm') notFound();

  const callerRole = aw?.callerRole ?? null;
  const worldSwitcher = token ? (
    <WorldSwitcherShell
      token={token}
      activeWorldId={aw?.id ?? null}
      callerRole={callerRole}
    />
  ) : undefined;

  // No active world — render empty state (no 500), consistent with Facciones/Quests.
  if (!aw) {
    return (
      <AppShell
        title="Herramientas"
        subtitle="TIENDA"
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="/herramientas/tienda" />
        <V3Empty
          glyph="book"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para curar la tienda."
        />
      </AppShell>
    );
  }

  // SSR fetch: all mundane items (no forSale filter — the DM curates the full list)
  // + the world's current rulesProfile.shopCuration for initial editor state.
  const [itemsData, worldDetail] = await Promise.all([
    api
      .get<ItemsListEnvelope>(`/compendium/items?world=${aw.id}&magic=false&limit=200`, token)
      .catch(() => null),
    api.get<WorldDetailWithRulesProfile>(`/worlds/${aw.id}`, token).catch(() => null),
  ]);

  const items = itemsData?.data ?? [];
  const shopCuration = worldDetail?.rulesProfile.shopCuration ?? { enabled: false, forSale: [] };

  return (
    <AppShell
      title="Herramientas"
      subtitle="TIENDA"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="/herramientas/tienda" />
      <div className="px-4 py-4">
        <ShopCurationEditor
          worldId={aw.id}
          items={items}
          initialEnabled={shopCuration.enabled}
          initialForSale={shopCuration.forSale}
        />
      </div>
    </AppShell>
  );
}
