'use client';

/**
 * PendientesFichaCardIsland — catalog wrapper for the REAL PendientesFichaCard.
 *
 * Passes NOOP_PENDIENTES_ACTIONS down so the embedded PendientesActionButtons
 * never fire the real approve/reject server actions in the catalog.
 */

import { PendientesFichaCard } from '@/components/inicio/dm/pendientes-ficha-card';
import type { PendingFichaSummary } from '@/components/inicio/types';
import { NOOP_PENDIENTES_ACTIONS } from './_pendientes-stub';

export function PendientesFichaCardIsland({ ficha }: { ficha: PendingFichaSummary }) {
  return <PendientesFichaCard ficha={ficha} actions={NOOP_PENDIENTES_ACTIONS} />;
}
