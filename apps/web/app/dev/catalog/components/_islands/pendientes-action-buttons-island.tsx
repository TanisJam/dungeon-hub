'use client';

/**
 * PendientesActionButtonsIsland — catalog wrapper for the REAL PendientesActionButtons.
 *
 * The production component accepts injectable `actions` (PendientesActions); the
 * catalog passes a stub so Aprobar/Devolver never fire the real server actions.
 * A short confirmation line shows which stub ran. "Ver ficha" is the real Link.
 *
 * INTERACTIVE — approve/reject run the injected stub (~400ms) then confirm.
 */

import { useState } from 'react';
import { PendientesActionButtons } from '@/components/inicio/dm/pendientes-action-buttons';

type Props = {
  fichaId: string;
};

export function PendientesActionButtonsIsland({ fichaId }: Props) {
  const [lastAction, setLastAction] = useState<'approved' | 'rejected' | null>(null);

  const actions = {
    onApprove: async () => {
      await new Promise((r) => setTimeout(r, 400));
      setLastAction('approved');
      setTimeout(() => setLastAction(null), 1500);
    },
    onReject: async () => {
      await new Promise((r) => setTimeout(r, 400));
      setLastAction('rejected');
      setTimeout(() => setLastAction(null), 1500);
    },
  };

  return (
    <div className="flex flex-col gap-1.5">
      <PendientesActionButtons fichaId={fichaId} actions={actions} />
      {lastAction === 'approved' && (
        <p className="text-[10px] text-primary-deep font-mono text-center">(Catálogo) onApprove stub → OK (no real server action)</p>
      )}
      {lastAction === 'rejected' && (
        <p className="text-[10px] text-ink-soft font-mono text-center">(Catálogo) onReject stub → OK (no real server action)</p>
      )}
    </div>
  );
}
