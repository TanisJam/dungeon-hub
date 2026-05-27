'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { approveFichaFromInicio, rejectFichaFromInicio } from '@/app/inicio/actions';

type Props = {
  fichaId: string;
};

export function PendientesActionButtons({ fichaId }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="pendientes-actions-row">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => { await approveFichaFromInicio(fichaId); })}
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
        onClick={() => startTransition(async () => { await rejectFichaFromInicio(fichaId); })}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold bg-surface-raised text-ink-mute disabled:opacity-50"
      >
        Devolver
      </button>
    </div>
  );
}
