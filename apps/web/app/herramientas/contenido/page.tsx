import { redirect, notFound } from 'next/navigation';
import { homebrewSourceCode } from '@dungeon-hub/domain/homebrew';
import { createClient } from '@/lib/supabase/server';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { SubNav } from '@/components/world/_shell/sub-nav';
import { V3Empty } from '@/components/ui';
import { HERRAMIENTAS_SUBNAV_ITEMS } from '../_components/subnav-items';
import { HomebrewUploadForm } from './_form';

/**
 * Contenido — DM page for custom content via JSON upload, items only
 * (MVP #3.8, DEC-1 locked 2026-06-04: JSON upload, not visual authoring).
 * Server-side enforcement already existed (rulesProfile.sources gating,
 * POST /worlds/:worldId/homebrew/items) — this page is the missing
 * DM-facing way to reach it.
 *
 * Gating mirrors apps/web/app/herramientas/quests/page.tsx: DM-only route,
 * player gets notFound() (default-deny, ADR-2) since the API itself
 * already 403s non-GMs — no point rendering the form for a caller who
 * can't submit it.
 */
export default async function ContenidoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const [aw, viewPref] = await Promise.all([getActiveWorld(token), getViewPreference()]);

  const effectiveView =
    aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  if (effectiveView !== 'dm') notFound();

  const callerRole = aw?.callerRole ?? null;
  const worldSwitcher = token ? (
    <WorldSwitcherShell token={token} activeWorldId={aw?.id ?? null} callerRole={callerRole} />
  ) : undefined;

  if (!aw) {
    return (
      <AppShell
        title="Herramientas"
        subtitle="CONTENIDO"
        roleDefault={effectiveView}
        worldSwitcher={worldSwitcher}
        callerRole={callerRole}
      >
        <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="/herramientas/contenido" />
        <V3Empty
          glyph="book"
          title="Sin mundo activo"
          sub="Selecciona o crea un mundo para subir contenido homebrew."
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Herramientas"
      subtitle="CONTENIDO"
      roleDefault={effectiveView}
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="/herramientas/contenido" />
      <div className="px-4 py-4">
        <HomebrewUploadForm worldId={aw.id} sourceCode={homebrewSourceCode(aw.id)} />
      </div>
    </AppShell>
  );
}
