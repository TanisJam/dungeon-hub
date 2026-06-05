'use client';

// Dev-only catalog island for RageControlsView.
// Uses RageControlsView directly with fixture props + local React state
// (no server actions called — catalog visualization only).

import { useState } from 'react';
import { useToast } from '@/lib/use-toast';
import { RageControlsView } from '@/components/encuentros/rage-controls-view';

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
  const [pending] = useState(false);

  const isDisabled =
    !isOwnTurn ||
    bonusActionUsed ||
    (!isRaging && !rageUnlimited && localUsesRemaining <= 0);

  function handleToggle() {
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
    <RageControlsView
      isRaging={isRaging}
      isDisabled={isDisabled}
      pending={pending}
      actionError={null}
      toastMessage={toast}
      rageUnlimited={rageUnlimited}
      rageUsesRemaining={localUsesRemaining}
      rageMax={rageMax}
      onToggle={handleToggle}
    />
  );
}
