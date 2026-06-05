'use client';

// REQ-WCPT-WEB-UI-01, REQ-WCPT-WEB-UI-02 — PassTurnButtonView pure presentational layer.
// All state is derived externally; this component only renders.
// Mobile-first 375px: full-width button ≥44px touch target (CLAUDE.md §2).
// PHB p.189 — a creature may take fewer actions and declare its turn complete.

import { Button } from '@/components/ui/button';
import { FormErrorAlert } from '@/components/ui/form-error-alert';

export type PassTurnButtonViewProps = {
  /** Pre-derived from isOwnTurn. View just applies it. */
  isDisabled: boolean;
  pending: boolean;
  actionError: string | null;
  onPass: () => void;
};

export function PassTurnButtonView({
  isDisabled,
  pending,
  actionError,
  onPass,
}: PassTurnButtonViewProps) {
  return (
    <div className="flex flex-col gap-2">
      <FormErrorAlert message={actionError} />

      {/* Full-width ≥44px button (mobile-first 375px — CLAUDE.md §2) */}
      <Button
        tone="ghost"
        aria-label="Pasar turno"
        disabled={isDisabled || pending}
        onClick={onPass}
        fullWidth
      >
        Pasar Turno
      </Button>
    </div>
  );
}
