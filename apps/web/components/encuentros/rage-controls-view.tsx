'use client';

// REQ-WCR-WEB-UI-01 — RageControlsView pure presentational layer.
// All state is derived externally; this component only renders.
// Mobile-first 375px layout; button ≥44px touch target (CLAUDE.md §2).
// PHB p.48 — Rage: enter/end as a bonus action on own turn.

import { Button } from '@/components/ui/button';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { Toast } from '@/components/ui/toast';

export type RageControlsViewProps = {
  isRaging: boolean;
  /** Pre-derived from isOwnTurn + bonusActionUsed + remaining uses. View just applies it. */
  isDisabled: boolean;
  pending: boolean;
  actionError: string | null;
  toastMessage: string | null;
  rageUnlimited: boolean;
  rageUsesRemaining: number;
  rageMax: number;
  onToggle: () => void;
};

export function RageControlsView({
  isRaging,
  isDisabled,
  pending,
  actionError,
  toastMessage,
  rageUnlimited,
  rageUsesRemaining,
  rageMax,
  onToggle,
}: RageControlsViewProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* VERSION_CONFLICT toast */}
      <Toast message={toastMessage} />

      <FormErrorAlert message={actionError} />

      {/* Counter — PHB p.48 Rage uses; "Ilimitado" when L20 (sentinel 999) */}
      <p className="text-sm text-ink-soft">
        {rageUnlimited ? (
          <>Ilimitado usos de Furia</>
        ) : (
          <>{rageUsesRemaining}&nbsp;/&nbsp;{rageMax}&nbsp;usos de Furia</>
        )}
      </p>

      {/* Full-width ≥44px button (mobile-first 375px) */}
      <Button
        tone="ghost"
        aria-label={isRaging ? 'Terminar Furia' : 'Entrar en Furia'}
        disabled={isDisabled || pending}
        onClick={onToggle}
        fullWidth
      >
        {isRaging ? 'Terminar Furia' : 'Entrar en Furia'}
      </Button>
    </div>
  );
}
