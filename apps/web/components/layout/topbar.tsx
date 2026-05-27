import Link from 'next/link';
import type { ReactNode } from 'react';
import { CrowMark } from '@/components/ui/crow-mark';
import { Icon } from '@/components/ui/icon';
import { RoleSwitcher } from './role-switcher';

interface TopBarProps {
  title: string;
  subtitle?: ReactNode;
  /** When provided, replaces the default right cluster (RoleSwitcher + notif bell). */
  right?: ReactNode;
  /** Show the role switcher pill. Defaults true. */
  canBeDM?: boolean;
  /** Render the unread dot on the notif bell. */
  hasNotif?: boolean;
  /**
   * When set: back arrow renders in LEFT slot (CrowMark hidden);
   * canBeDM is suppressed; `right` prop still renders in right slot.
   * Design: docs/design_handoff_dungeon_hub/README.md § State management.
   */
  backHref?: string;
}

/**
 * TopBar — sticky app header (obsidian aesthetic).
 * Crow mark + title/subtitle + role switcher (if canBeDM) + notif bell.
 * When backHref is provided: back arrow in left slot, CrowMark hidden, RoleSwitcher suppressed.
 * Server component. RoleSwitcher is a client island.
 */
export function TopBar({
  title,
  subtitle,
  right,
  canBeDM = true,
  hasNotif = false,
  backHref,
}: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-2.5 px-3.5 pb-3 bg-paper/90 backdrop-blur-md border-b border-line"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      {/* LEFT slot: CrowMark (default) OR back arrow (when backHref set) */}
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Volver"
          className="w-[34px] h-[34px] grid place-items-center rounded-md border border-line text-ink-soft transition-colors duration-150 hover:bg-surface hover:text-ink flex-shrink-0"
        >
          <Icon name="arrow-left" size={16} />
        </Link>
      ) : (
        <CrowMark />
      )}
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="font-display font-bold text-[15px] leading-[1.15] tracking-tight text-ink truncate">
          {title}
        </span>
        {subtitle && (
          <span className="font-sans text-[10px] font-bold text-ink-mute tracking-[0.14em] uppercase leading-none">
            {subtitle}
          </span>
        )}
      </div>
      {/* RIGHT slot: rightAction prop OR default cluster (RoleSwitcher + bell) */}
      {right ?? (
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* RoleSwitcher visible in all screens (including sub-screens) when canBeDM=true */}
          {/* SDD ficha-dm-affordances: removed !backHref guard per spec override of design README §State management */}
          {canBeDM && <RoleSwitcher />}
          <button
            type="button"
            aria-label="Notificaciones"
            className={`relative w-[34px] h-[34px] grid place-items-center rounded-md border border-line text-ink-soft transition-colors duration-150 hover:bg-surface hover:text-ink${
              hasNotif
                ? " after:content-[''] after:absolute after:top-[5px] after:right-[5px] after:w-[7px] after:h-[7px] after:rounded-full after:bg-accent after:shadow-[0_0_6px_var(--color-accent)]"
                : ''
            }`}
          >
            <Icon name="eye" size={16} />
          </button>
        </div>
      )}
    </header>
  );
}
