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
import { ExportWorldButton } from './_export-world-button';
import { apiSupportsHomebrew } from './_api-supports-homebrew';

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

  // Hybrid deploy: the UI can reach production before the endpoints it calls.
  // No token means the probe cannot run — treat that as "supported" and let the
  // page render, the same way an unreachable API does. Hiding a section over a
  // missing session would be answering the wrong question.
  const supported = token ? await apiSupportsHomebrew(aw.id, token) : true;

  return (
    <AppShell
      title="Herramientas"
      subtitle="CONTENIDO"
      roleDefault={effectiveView}
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <SubNav items={HERRAMIENTAS_SUBNAV_ITEMS} activePath="/herramientas/contenido" />
      <div className="px-4 py-4 space-y-6">
        {supported ? (
          <>
            <HomebrewUploadForm worldId={aw.id} sourceCode={homebrewSourceCode(aw.id)} />

            <div className="space-y-2 border-t border-line pt-6">
              <h2 className="text-sm font-semibold text-ink">Exportar mundo</h2>
              <p className="text-xs text-ink-mute">
                Descargá un respaldo completo de tu mundo (NPCs, facciones, misiones, hexágonos,
                puntos de interés y bitácora) en un archivo JSON.
              </p>
              <ExportWorldButton worldId={aw.id} />
            </div>
          </>
        ) : (
          /* Rather than render a form and a button that both answer 404. The web
             app deploys itself; the API does not (docs/onboarding/api-deploy.md),
             so this page can arrive before its endpoints do. When they land, this
             branch stops rendering on its own — no flag to remember to flip. */
          <div
            role="status"
            className="rounded-md border border-line bg-surface px-4 py-6 text-center"
          >
            <p className="text-sm font-semibold text-ink">Esta sección todavía no está disponible</p>
            <p className="mt-2 text-xs text-ink-mute">
              Subir contenido propio y exportar el mundo necesitan una versión del API más nueva
              que la que está corriendo. El código ya está en <code>main</code>; falta desplegar el
              API, que se despliega a mano.
            </p>
            <p className="mt-2 text-xs text-ink-mute">
              Mientras tanto podés seguir usando el resto de Herramientas.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
