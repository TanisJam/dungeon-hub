import Link from 'next/link';
import type { ReactNode } from 'react';
import { CrowMark } from '@/components/ui/crow-mark';
import { Icon } from '@/components/ui/icon';
import type { Role } from '@/lib/use-role';
import { RoleSwitcher } from './role-switcher';
import { AccountMenu } from './account-menu';

interface TopBarProps {
  title: string;
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
   * WorldSwitcher widget (trigger + sheet) to render (F5: sm:+ only — the LEFT
   * slot pill, replacing the CrowMark there; on mobile it moves to its own
   * full-width row under the title instead, and the left slot falls back to
   * CrowMark). Passed as a pre-built ReactNode from AppShell (server-props
   * delivery, ADR-4). worldName is for display reference only when
   * worldSwitcher is not provided. REQ-WIS-03.
   */
  worldSwitcher?: ReactNode;
}

/**
 * TopBar — sticky app header (obsidian aesthetic).
 * Crow mark + title/subtitle + role switcher (if canBeDM) + notif bell.
 * When backHref is provided: back arrow in left slot, CrowMark hidden, RoleSwitcher suppressed.
 * When worldSwitcher is provided (and no backHref): sm:+ shows it as a LEFT
 * slot pill (CrowMark hidden there); mobile shows CrowMark in the left slot
 * instead and the world becomes a full-width tappable row under the title
 * (F5 — the world pill used to be capped at max-w-[88px] and truncated on
 * every page at 375px; see docs/audit/ui-craft-2026-09-10/README.md #F5).
 * Server component. RoleSwitcher is a client island.
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
  // F5: on mobile, the world leaves the left slot entirely and becomes a
  // full-width row under the title (see the flex-wrap row below); the left
  // slot falls back to its next-in-line precedence there, which is CrowMark.
  // Only sm:+ still shows the world as a left-slot pill, and that pill now
  // lives inside `worldSwitcher` itself (see world-switcher.tsx) rather than
  // being returned from here — see `showWorldSwitcher` below for why.
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
    if (worldSwitcher) {
      // Mobile-only fallback: the desktop pill is rendered by `worldSwitcher`
      // itself (inserted right after this slot, below), hidden at sm:+.
      return (
        <span className="flex-shrink-0 sm:hidden">
          <CrowMark />
        </span>
      );
    }
    return <CrowMark />;
  }

  return (
    <header
      className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md border-b border-line"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      <div className="mx-auto flex w-full max-w-sm flex-wrap items-center gap-2.5 px-3.5 pb-3 md:max-w-3xl">
      {/* LEFT slot: backHref > worldSwitcher (sm:+ pill, see below) > CrowMark */}
      {renderLeftSlot()}
      {/*
       * F5: `worldSwitcher` is inserted ONCE (never twice — see world-switcher.tsx
       * for why). It internally renders its own sm:+ pill (default order, so it
       * lands right here, right after the left slot) and its own mobile line
       * (order-last, so — thanks to flex-wrap — it always sorts after the title
       * and right slot and wraps onto its own full-width row below them).
       */}
      {showWorldSwitcher && worldSwitcher}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <h1 className="font-display font-bold text-[15px] leading-[1.15] tracking-tight text-ink truncate m-0">
          {title}
        </h1>
        {subtitle && (
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
