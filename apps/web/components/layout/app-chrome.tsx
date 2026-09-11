'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { CallerRole } from '@/lib/active-world';
import { classifyRoute } from '@/lib/route-chrome';
import { DesktopSidebar } from './desktop-sidebar';
import { TabBar } from './tabbar';
import { TopbarHeightProbe } from './topbar-height-probe';

interface AppChromeProps {
  /** Server-resolved caller role for the active world, forwarded from the
   * root layout (see app/layout.tsx). Drives the GM-only nav entries in
   * DesktopSidebar/TabBar. */
  callerRole?: CallerRole;
  children: ReactNode;
}

/**
 * AppChrome — mounts the persistent nav chrome ONCE in the root layout
 * (audit F1, work unit 1). Replaces the old pattern of rendering AppShell
 * (which used to own DesktopSidebar + TabBar) inside every page.tsx: that
 * destroyed and recreated the `<nav>` elements on every navigation even
 * though they render identically across pages.
 *
 * Classifies the current pathname via classifyRoute() and either renders
 * children untouched (standalone routes: `/`, `/auth/**`, `/invite/**`,
 * `/link/**`, `/dev/**`) or wraps them in the same grid + DesktopSidebar +
 * TabBar markup AppShell used to own. AppShell itself now renders only
 * TopBar + main.
 *
 * Also mounts TopbarHeightProbe unconditionally — it is a no-op on
 * standalone routes (no TopBar to find) and publishes `--topbar-h` on every
 * other route, so any descendant can measure the real header height instead
 * of guessing at it (fix/topbar-height-token).
 */
export function AppChrome({ callerRole, children }: AppChromeProps) {
  const pathname = usePathname();
  const { shell, tabBar } = classifyRoute(pathname);

  if (!shell) {
    return (
      <>
        <TopbarHeightProbe />
        {children}
      </>
    );
  }

  return (
    <>
      <TopbarHeightProbe />
      <div className="md:grid md:grid-cols-[var(--sidebar-w)_1fr]">
        <DesktopSidebar callerRole={callerRole} />
        <div className="md:min-w-0">{children}</div>
      </div>
      {tabBar && <TabBar callerRole={callerRole} />}
    </>
  );
}
