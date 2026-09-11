import Link from 'next/link';
import type { ReactNode } from 'react';
import { CrowMark } from '@/components/ui/crow-mark';
import { Icon } from '@/components/ui/icon';
import type { Role } from '@/lib/use-role';
import { RoleSwitcher } from './role-switcher';
import { AccountMenu } from './account-menu';

interface TopBarProps {
  /** Page title. Usually a string; a loading.tsx may pass a <Skeleton> bar instead (audit F1). */
  title: ReactNode;
  subtitle?: ReactNode;
  /** When provided, replaces the default right cluster (RoleSwitcher + notif bell). */
  right?: ReactNode;
  /** Show the role switcher pill. Defaults true. */
  canBeDM?: boolean;
  /**
   * When set: back arrow renders in LEFT slot (CrowMark hidden);
   * canBeDM is suppressed; `right` prop still renders in right slot.
   * Design: docs/design_handoff_dungeon_hub/README.md § State management.
   */
  backHref?: string;
  /**
   * Server-resolved current role (from the dh:role cookie). Forwarded to the
   * RoleSwitcher as its initial value so it renders the correct pill on first
   * paint — avoids the "loads as Jugador then flips to DM" flash. Defaults to
   * 'player'.
   */
  roleDefault?: Role;
  /**
   * WorldSwitcher widget (trigger + sheet), rendered under the title. Passed as
   * a pre-built ReactNode from AppShell (server-props delivery, ADR-4).
   * worldName is for display reference only when worldSwitcher is not provided.
   * REQ-WIS-03. F5 moved it out of the left slot, where an 88px cap cut the
   * world name on every page.
   */
  worldSwitcher?: ReactNode;
}

/**
 * TopBar — sticky app header (obsidian aesthetic).
 * Crow mark + title + world (or subtitle) + role switcher (if canBeDM).
 * When backHref is provided: back arrow in left slot, CrowMark hidden,
 * RoleSwitcher suppressed.
 * When worldSwitcher is provided (and no backHref) it renders under the title
 * and takes the subtitle's place, on every viewport.
 * Server component. RoleSwitcher is a client island.
 *
 * `data-app-topbar` is a stable hook read by TopbarHeightProbe
 * (components/layout/topbar-height-probe.tsx), which measures this header's
 * real rendered height at runtime and publishes it as `--topbar-h` on
 * <html>. The header's height is NOT constant — the safe-area padding is
 * device-dependent and a worldSwitcher grows the header — so any fixed-size
 * layout that needs to clear this header MUST use `var(--topbar-h)`, never a
 * hardcoded pixel offset (see fix/topbar-height-token).
 */
export function TopBar({
  title,
  subtitle,
  right,
  canBeDM = true,
  backHref,
  roleDefault = 'player',
  worldSwitcher,
}: TopBarProps) {
  // F5: the world moved out of the left slot, where an 88px cap cut its name on
  // every page, and under the title, where the width is. The left slot goes back
  // to the CrowMark. A page that sends both a world and an eyebrow subtitle shows
  // the world: it is the context that was being lost, and the eyebrow largely
  // repeats the title.
  const showWorldSwitcher = Boolean(worldSwitcher) && !backHref;

  // Precedence: backHref > worldSwitcher > CrowMark (ADR design: backHref check first)
  function renderLeftSlot() {
    if (backHref) {
      return (
        // The link is the tap target, the span is the 34px square — same split as
        // AccountMenu on the other end of the header, and for the same reason:
        // the cluster is designed around 34px boxes.
        <Link
          href={backHref}
          aria-label="Volver"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center bg-transparent p-0 flex-shrink-0"
        >
          <span className="w-[34px] h-[34px] grid place-items-center rounded-md border border-line text-ink-soft transition-colors duration-150 hover:bg-surface hover:text-ink flex-shrink-0">
            <Icon name="arrow-left" size={16} />
          </span>
        </Link>
      );
    }
    return <CrowMark />;
  }

  return (
    <header
      data-app-topbar
      className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b border-line"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      <div className="mx-auto flex w-full max-w-sm items-center gap-2.5 px-3.5 pb-3 md:max-w-3xl">
      {/* LEFT slot: backHref arrow, else the CrowMark */}
      {renderLeftSlot()}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <h1 className="font-display font-bold text-[15px] leading-[1.15] tracking-tight text-ink truncate m-0">
          {title}
        </h1>
        {/*
         * F5: the world sits under the title, where the width is. A capped pill
         * in the left slot cut the name on all seven measured pages; here the
         * name has the title column to itself and the header grows by the
         * column's height rather than by a whole row.
         */}
        {showWorldSwitcher && worldSwitcher}
        {subtitle && !showWorldSwitcher && (
          <span className="hidden sm:block font-sans text-[10px] font-bold text-ink-mute tracking-[0.14em] uppercase leading-none truncate">
            {subtitle}
          </span>
        )}
      </div>
      {/* RIGHT slot: `right` prop OR the RoleSwitcher (DM/PJ view toggle), and
          then AccountMenu, ALWAYS.
          The old notifications button was a dead affordance (no handler, no
          notifications feature) and used an eye glyph, so it was removed —
          it also freed header width, easing title truncation on mobile.
          AccountMenu is the fix for the audit's worst finding: /dashboard held
          the app's only sign-out control and was absent from every nav surface,
          so a user navigating the shell could not log out. It therefore sits
          OUTSIDE the `right ?? ...` fallback: `right` replaces the page-variable
          part of the cluster, never the account affordance. Putting it inside
          would have reopened the same hole on the four pages that pass
          rightAction — /characters/[id], /characters/new, the wizard layout and
          /campanas/new — one of which is a primary tab destination. */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {right ?? (
          <>
            {/* RoleSwitcher visible in all screens (including sub-screens) when canBeDM=true */}
            {/* SDD ficha-dm-affordances: removed !backHref guard per spec override of design README §State management */}
            {canBeDM && <RoleSwitcher defaultRole={roleDefault} />}
          </>
        )}
        <AccountMenu />
      </div>
      </div>
    </header>
  );
}
