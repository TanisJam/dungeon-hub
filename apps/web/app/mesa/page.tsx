import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { AppShell } from '@/components/layout/app-shell';
import { WorldSwitcherShell } from '@/app/_components/world-switcher-shell';
import { Icon, type IconName } from '@/components/ui';
import { HERRAMIENTAS_SUBNAV_ITEMS } from '../herramientas/_components/subnav-items';

const HERRAMIENTAS_ICONS: Record<string, IconName> = {
  '/herramientas/facciones': 'shield',
  '/herramientas/npcs': 'user',
  '/herramientas/quests': 'scroll',
  '/herramientas/tienda': 'bag',
  '/herramientas/contenido': 'book',
};

/**
 * MesaPage — the GM's workspace hub (navigability-audit fix).
 *
 * Every one of these surfaces was previously reachable only through nested
 * navigation (Aprobaciones only from inside /dashboard; the five Herramientas
 * routes only by first landing on /herramientas/facciones via a conditional
 * /inicio quick action, then using that page's SubNav; Encuentros likewise).
 * This hub gives them all a single, always-reachable entry point: the Mesa
 * tab (TabBar/DesktopSidebar, gated on callerRole).
 *
 * Gate: effectiveView !== 'dm' → notFound(), same default-deny as every
 * other DM tool (REQ-DMTOOLS-02, ADR-2) — canonical formula from
 * app/herramientas/facciones/page.tsx. This is DELIBERATELY different from
 * the Mesa TAB's gate (callerRole === 'gm'): the tab must stay stable while
 * a GM toggles the DM/Jugador view switcher, but the page itself still
 * default-denies when that switcher is set to "player" preview, exactly
 * like every other DM tool page does.
 */
export default async function MesaPage() {
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

  // Canonical effectiveView formula (REQ-WIS-08)
  const effectiveView =
    aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  // DM-only route — non-DM gets notFound (default-deny, ADR-2)
  if (effectiveView !== 'dm') notFound();

  // effectiveView === 'dm' is only reachable when aw.callerRole === 'gm', so aw is
  // guaranteed non-null here (same invariant every /herramientas/* page relies on).
  const worldId = aw!.id;
  const callerRole = aw!.callerRole;

  const worldSwitcher = token ? (
    <WorldSwitcherShell token={token} activeWorldId={worldId} callerRole={callerRole} />
  ) : undefined;

  const links: { label: string; href: string; icon: IconName }[] = [
    { label: 'Aprobaciones', href: `/worlds/${worldId}`, icon: 'check' },
    { label: 'Encuentros', href: '/encuentros', icon: 'sword' },
    ...HERRAMIENTAS_SUBNAV_ITEMS.map((item) => ({
      label: item.label,
      href: item.href,
      icon: HERRAMIENTAS_ICONS[item.href] ?? 'hammer',
    })),
  ];

  return (
    <AppShell
      title="Mesa"
      subtitle="HERRAMIENTAS DEL DM"
      worldSwitcher={worldSwitcher}
      callerRole={callerRole}
    >
      <nav aria-label="Herramientas de Mesa" className="flex flex-col gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex min-h-[44px] items-center gap-3 rounded-md border border-line bg-surface-raised px-3 py-2.5 transition-colors duration-150 hover:border-accent hover:bg-surface"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-surface text-accent">
              <Icon name={link.icon} size={18} />
            </span>
            <span className="font-sans text-sm font-semibold text-ink">{link.label}</span>
          </Link>
        ))}
      </nav>
    </AppShell>
  );
}
