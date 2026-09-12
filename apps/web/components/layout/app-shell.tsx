import type { ReactNode } from 'react';
import type { Role } from '@/lib/use-role';
import type { CallerRole } from '@/lib/active-world';
import { TopBar } from './topbar';

type AppShellProps = {
  /**
   * Page title. Usually a string, but a dynamic route's loading.tsx renders a
   * <Skeleton> shimmer bar here instead of inventing a fake title while the
   * real one (e.g. a character name) is still loading server-side (audit F1,
   * work unit 2).
   */
  title: ReactNode;
  subtitle?: ReactNode;
  /** When provided, overrides the topbar's default right cluster (the role switcher). */
  rightAction?: ReactNode;
  /** @deprecated v3 tabs are declarative; constructor is reachable via Personajes. Accepted for backwards compat. */
  constructorHref?: string;
  /** Show the role switcher pill in the topbar. Defaults false (ADR-C2, default-deny). */
  canBeDM?: boolean;
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
  /**
   * Forwarded to TopBar. 'p' for pages that render the same heading again in
   * their own content, so the document has exactly one h1 (audit F8).
   */
  titleAs?: 'h1' | 'p';
  children: ReactNode;
};

/**
 * AppShell — authenticated page content shell (v3, obsidian aesthetic).
 * TopBar (sticky) + scrollable main. Pure server component.
 *
 * The persistent nav chrome (DesktopSidebar + TabBar + the md:grid wrapper
 * around this component) moved OUT of AppShell and into AppChrome, mounted
 * once in the root layout (audit F1, work unit 1) — see
 * apps/web/components/layout/app-chrome.tsx and apps/web/lib/route-chrome.ts.
 * Previously AppShell rendered inside every page.tsx, so DesktopSidebar and
 * TabBar were destroyed and recreated on every navigation even though they
 * render identically across pages. AppShell still takes `callerRole`: it's
 * needed here for the canBeDM derivation below (RoleSwitcher gating), even
 * though it no longer forwards it to any nav component.
 *
 * World props (worldId, worldSwitcher, callerRole) are OPTIONAL and additive.
 * Pages that pass nothing render exactly as before (REQ-WIS-03 graceful fallback).
 */
export function AppShell({
  title,
  subtitle,
  rightAction,
  canBeDM: canBeDMProp = false,
  backHref,
  roleDefault = 'player',
  worldSwitcher,
  callerRole,
  titleAs,
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
        backHref={backHref}
        roleDefault={roleDefault}
        worldSwitcher={worldSwitcher}
        {...(titleAs ? { titleAs } : {})}
      />
      <main className="mx-auto min-h-screen max-w-sm px-4 py-4 pb-28 md:max-w-3xl md:pb-8">
        {children}
      </main>
    </>
  );
}
