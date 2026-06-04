'use client';

// REQ-WCPT-WEB-UI-01 — PlayerActionPanel layout shell.
// Reusable container for player turn actions (C1/C2/C3/C4).
// ADR-3: panel = pure layout; each action is its OWN island passed as children.
// C1 ships PassTurnButton as a child; C2/C3/C4 add siblings — zero panel rework.
// Mobile-first 375px: single-column flex stack; inherits max-w-md from page.

import type { ReactNode } from 'react';

type Props = {
  /** Action islands to render (e.g. PassTurnButton, AttackSheet, etc.) */
  children: ReactNode;
};

export function PlayerActionPanel({ children }: Props) {
  return (
    <section aria-label="Acciones">
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </section>
  );
}
