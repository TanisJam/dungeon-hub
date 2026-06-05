import type { ReactNode } from 'react';
import type { Role } from '@/lib/use-role';
import type { CallerRole } from '@/lib/active-world';
import { TopBar } from './topbar';
import { TabBar } from './tabbar';

type AppShellProps = {
  title: string;
  subtitle?: ReactNode;
  /** When provided, overrides the topbar's default right cluster (role switcher + notif bell). */
  rightAction?: ReactNode;
  /** @deprecated v3 tabs are declarative; constructor is reachable via Personajes. Accepted for backwards compat. */
  constructorHref?: string;
  /** Show the role switcher pill in the topbar. Defaults false (ADR-C2, default-deny). */
  canBeDM?: boolean;
  /** Render the unread dot on the notif bell. Defaults false. */
  hasNotif?: boolean;
  /** Hide the morphing tabbar (e.g. wizard / full-bleed flows). Defaults true. */
  showTabBar?: boolean;
  /**
   * When set: TopBar shows a back arrow linking to this path.
   * CrowMark is hidden. RoleSwitcher is forwarded as-is (canBeDM unchanged).
   * SDD ficha-dm-affordances overrides old suppression: RoleSwitcher visible in sub-screens when canBeDM=true.
   */
  backHref?: string;
  /** Server-resolved current role (dh:role cookie) forwarded to the RoleSwitcher
   * so it renders the correct pill on first paint (no Jugador→DM flash). */
  roleDefault?: Role;
  /**
   * Active world id. Optional — pages that pass nothing render exactly as before (REQ-WIS-03).
   * Used in conjunction with worldSwitcher to associate the current world id.
   */
  worldId?: string;
  /**
   * Pre-built WorldSwitcherShell ReactNode (server-props delivery, ADR-4).
   * When provided and backHref is not set, replaces the CrowMark in TopBar's left slot.
   * Pages that pass nothing get the CrowMark fallback — no error (REQ-WIS-03).
   */
  worldSwitcher?: ReactNode;
  /**
   * Caller's role in the active world ('gm' | 'player' | null).
   * When provided, auto-derives canBeDM = callerRole === 'gm' (ADR-5).
   * Falls back to the explicit canBeDM prop (or its default false) for un-migrated pages (ADR-C2).
   */
  callerRole?: CallerRole;
  children: ReactNode;
};

/**
 * AppShell — authenticated page shell (v3, obsidian aesthetic).
 * TopBar (sticky) + scrollable main + morphing TabBar (role-aware).
 * Server component; TabBar / RoleSwitcher are client islands.
 *
 * World props (worldId, worldSwitcher, callerRole) are OPTIONAL and additive.
 * Pages that pass nothing render exactly as before (REQ-WIS-03 graceful fallback).
 */
export function AppShell({
  title,
  subtitle,
  rightAction,
  canBeDM: canBeDMProp = false,
  hasNotif = false,
  showTabBar = true,
  backHref,
  roleDefault = 'player',
  worldSwitcher,
  callerRole,
  children,
}: AppShellProps) {
  // ADR-5 / ADR-C2: auto-derive canBeDM from callerRole when world context is present.
  // Falls back to canBeDMProp (now default false — Slice C default-deny) for un-migrated/account-level pages.
  const canBeDM = callerRole !== undefined ? callerRole === 'gm' : canBeDMProp;

  return (
    <>
      <TopBar
        title={title}
        subtitle={subtitle}
        right={rightAction}
        canBeDM={canBeDM}
        hasNotif={hasNotif}
        backHref={backHref}
        roleDefault={roleDefault}
        worldSwitcher={worldSwitcher}
      />
      <main className="mx-auto max-w-sm px-4 py-4 pb-28">{children}</main>
      {showTabBar && <TabBar />}
    </>
  );
}
