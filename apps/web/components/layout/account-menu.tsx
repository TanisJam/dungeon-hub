'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { SignOutButton } from '@/app/_components/sign-out-button';

/**
 * AccountMenu — TopBar right-cluster client island exposing the account
 * destinations that were previously reachable ONLY from inside /dashboard
 * (which held the app's only sign-out control — the worst navigability
 * finding in the audit).
 *
 * Structured like WorldSwitcher: a compact icon trigger button opens a
 * V3Sheet (bottom sheet) listing the destinations. V3Sheet already provides
 * the accessible dialog semantics (role=dialog, focus trap, Escape-to-close)
 * this menu needs. Owns its own SignOutButton import (mirrors how
 * RoleSwitcher is self-contained rather than threaded prop-by-prop through
 * TopBar) so TopBar itself stays free of the supabase-client import chain.
 */
export function AccountMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cuenta"
        aria-haspopup="dialog"
        className="w-[34px] h-[34px] grid place-items-center rounded-md border border-line text-ink-soft transition-colors duration-150 hover:bg-surface hover:text-ink flex-shrink-0"
      >
        <Icon name="user" size={16} />
      </button>

      <V3Sheet open={open} onClose={() => setOpen(false)} title="Cuenta" labelledBy="account-menu-heading">
        <nav aria-label="Cuenta" className="flex flex-col gap-1">
          <Link
            href="/personajes"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-ink transition-colors duration-150 hover:bg-surface"
          >
            <Icon name="user" size={18} className="text-ink-soft" />
            <span className="font-sans text-[13px] font-semibold">Mis personajes</span>
          </Link>
          <Link
            href="/campanas"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-ink transition-colors duration-150 hover:bg-surface"
          >
            <Icon name="crown" size={18} className="text-ink-soft" />
            <span className="font-sans text-[13px] font-semibold">Mis campañas</span>
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2.5 text-ink transition-colors duration-150 hover:bg-surface"
          >
            <Icon name="edit" size={18} className="text-ink-soft" />
            <span className="font-sans text-[13px] font-semibold">Ajustes</span>
          </Link>
          <div className="mt-1 border-t border-line pt-2">
            <SignOutButton />
          </div>
        </nav>
      </V3Sheet>
    </>
  );
}
