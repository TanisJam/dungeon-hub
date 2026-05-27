import type { ReactNode } from 'react';
import { TopBar } from './topbar';
import { TabBar } from './tabbar';

type AppShellProps = {
  title: string;
  subtitle?: ReactNode;
  /** When provided, overrides the topbar's default right cluster (role switcher + notif bell). */
  rightAction?: ReactNode;
  /** @deprecated v3 tabs are declarative; constructor is reachable via Personajes. Accepted for backwards compat. */
  constructorHref?: string;
  /** Show the role switcher pill in the topbar. Defaults true. */
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
  children: ReactNode;
};

/**
 * AppShell — authenticated page shell (v3, obsidian aesthetic).
 * TopBar (sticky) + scrollable main + morphing TabBar (role-aware).
 * Server component; TabBar / RoleSwitcher are client islands.
 */
export function AppShell({
  title,
  subtitle,
  rightAction,
  canBeDM = true,
  hasNotif = false,
  showTabBar = true,
  backHref,
  children,
}: AppShellProps) {
  return (
    <>
      <TopBar
        title={title}
        subtitle={subtitle}
        right={rightAction}
        canBeDM={canBeDM}
        hasNotif={hasNotif}
        backHref={backHref}
      />
      <main className="mx-auto max-w-sm px-4 py-4 pb-28">{children}</main>
      {showTabBar && <TabBar />}
    </>
  );
}
