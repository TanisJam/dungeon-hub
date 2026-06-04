'use client';

// NOTE: mirrors RageControls (apps/web/components/encuentros/rage-controls.tsx)
// Dev-only catalog island — supplies fixture props + stub handlers (no server actions called).
// Rage toggle is local state only; Toast feedback confirms the action visually.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/lib/use-toast';

type Props = {
  isOwnTurn?: boolean;
  bonusActionUsed?: boolean;
  rageUsesRemaining?: number;
  rageMax?: number;
  rageUnlimited?: boolean;
  initialRaging?: boolean;
};

export function RageControlsIsland({
  isOwnTurn = true,
  bonusActionUsed = false,
  rageUsesRemaining = 2,
  rageMax = 2,
  rageUnlimited = false,
  initialRaging = false,
}: Props) {
  const { message: toast, showToast } = useToast();
  const [isRaging, setIsRaging] = useState(initialRaging);
  const [localUsesRemaining, setLocalUsesRemaining] = useState(rageUsesRemaining);

  const isDisabled =
    !isOwnTurn ||
    bonusActionUsed ||
    (!isRaging && !rageUnlimited && localUsesRemaining <= 0);

  function handleClick() {
    if (isRaging) {
      setIsRaging(false);
      showToast('(Catálogo) Furia terminada — sin acción de servidor real.');
    } else {
      setIsRaging(true);
      if (!rageUnlimited) {
        setLocalUsesRemaining((prev) => Math.max(0, prev - 1));
      }
      showToast('(Catálogo) Furia activada — sin acción de servidor real.');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Toast message={toast} />

      <p className="text-sm text-ink-soft">
        {rageUnlimited ? (
          <>Ilimitado usos de Furia</>
        ) : (
          <>{localUsesRemaining}&nbsp;/&nbsp;{rageMax}&nbsp;usos de Furia</>
        )}
      </p>

      <Button
        tone="ghost"
        aria-label={isRaging ? 'Terminar Furia' : 'Entrar en Furia'}
        disabled={isDisabled}
        onClick={handleClick}
        className="w-full min-h-[44px]"
      >
        {isRaging ? 'Terminar Furia' : 'Entrar en Furia'}
      </Button>
    </div>
  );
}
