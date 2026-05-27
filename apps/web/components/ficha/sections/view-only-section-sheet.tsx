'use client';

import React from 'react';
import Link from 'next/link';
import { V3Sheet } from '@/components/ui/sheet';
import type { CharacterStatus } from '@/lib/sheet-types';

/**
 * ViewOnlySectionSheet — read-only display sheet for Race/Class/Background sections.
 * Status-conditional CTA per VIEW-SHEET-02:
 *   draft|pending_approval (any role)   → Link "Editar" → wizardStepHref
 *   active|retired|dead + isDm=true     → Link "Editar (DM)" → wizardStepHref
 *   active|retired|dead + isDm=false    → locked banner
 *
 * Design: sdd/ficha-section-editors — VIEW-SHEET-01, VIEW-SHEET-02, VIEW-SHEET-03.
 */

interface ViewOnlySectionSheetProps {
  /** Title shown in the sheet header (VIEW-SHEET-01). */
  title: string;
  /** Read-only display content for the section body. */
  currentDisplay: React.ReactNode;
  characterStatus: CharacterStatus;
  /** True when the current user is the GM. */
  isDm: boolean;
  /** Wizard step URL for the edit link. */
  wizardStepHref: string;
  /** Sheet open/close state — controlled externally. */
  open: boolean;
  onClose: () => void;
  /** Optional aria-label forwarded to the dialog (VIEW-SHEET-03). */
  ariaLabel?: string;
}

type CTA =
  | { kind: 'edit-link'; label: string }
  | { kind: 'locked-banner' };

function resolveCta(status: CharacterStatus, isDm: boolean): CTA {
  const isLockable = status === 'active' || status === 'retired' || status === 'dead';
  if (!isLockable) {
    return { kind: 'edit-link', label: 'Editar' };
  }
  if (isDm) {
    return { kind: 'edit-link', label: 'Editar (DM)' };
  }
  return { kind: 'locked-banner' };
}

export function ViewOnlySectionSheet({
  title,
  currentDisplay,
  characterStatus,
  isDm,
  wizardStepHref,
  open,
  onClose,
  ariaLabel,
}: ViewOnlySectionSheetProps) {
  const cta = resolveCta(characterStatus, isDm);

  return (
    <V3Sheet open={open} onClose={onClose} title={title} labelledBy={ariaLabel ? undefined : undefined}>
      <div aria-label={ariaLabel}>
        {/* Section read-only body */}
        <div className="font-sans text-sm text-ink mb-4">{currentDisplay}</div>

        {/* Status-conditional CTA */}
        {cta.kind === 'edit-link' && (
          <Link
            href={wizardStepHref}
            className="inline-flex items-center justify-center rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent transition-colors"
            onClick={onClose}
          >
            {cta.label}
          </Link>
        )}

        {cta.kind === 'locked-banner' && (
          <div
            role="alert"
            className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft"
          >
            Esta ficha está cerrada. Pedíle al DM que la devuelva.
          </div>
        )}
      </div>
    </V3Sheet>
  );
}
