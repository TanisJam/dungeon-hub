'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { approveFichaFromInicio, rejectFichaFromInicio } from '@/app/inicio/actions';

/**
 * Approve / reject handlers. Injectable so non-production surfaces (e.g. the dev
 * catalog) can pass stubs instead of firing the real server actions. Defaults to
 * the real server actions when omitted.
 */
export type PendientesActions = {
  onApprove: (fichaId: string) => Promise<void> | Promise<unknown> | void;
  onReject: (fichaId: string) => Promise<void> | Promise<unknown> | void;
};

const DEFAULT_ACTIONS: PendientesActions = {
  onApprove: approveFichaFromInicio,
  onReject: rejectFichaFromInicio,
};

type Props = {
  fichaId: string;
  actions?: PendientesActions;
};

export function PendientesActionButtons({ fichaId, actions }: Props) {
  const [isPending, startTransition] = useTransition();
  const { onApprove, onReject } = actions ?? DEFAULT_ACTIONS;

  return (
    <div className="pendientes-actions-row">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await onApprove(fichaId); })}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-magenta-600 text-white disabled:opacity-50"
      >
        Aprobar
      </button>
      <Link
        href={`/characters/${fichaId}`}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-surface-raised text-ink"
      >
        Ver ficha
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await onReject(fichaId); })}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-surface-raised text-ink-mute disabled:opacity-50"
      >
        Devolver
      </button>
    </div>
  );
}
