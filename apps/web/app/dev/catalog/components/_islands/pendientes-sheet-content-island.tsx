'use client';

/**
 * PendientesSheetContentIsland — catalog wrapper for the REAL PendientesSheetContent.
 *
 * Passes NOOP_PENDIENTES_ACTIONS down the card chain so the embedded approve/reject
 * buttons never fire the real server actions in the catalog.
 */

import { PendientesSheetContent } from '@/components/inicio/dm/pendientes-sheet-content';
import type { PendingFichaSummary, QuestSinTocar } from '@/components/inicio/types';
import { NOOP_PENDIENTES_ACTIONS } from './_pendientes-stub';

export function PendientesSheetContentIsland({
  fichas,
  quests,
}: {
  fichas: PendingFichaSummary[];
  quests: QuestSinTocar[];
}) {
  return (
    <PendientesSheetContent fichas={fichas} quests={quests} actions={NOOP_PENDIENTES_ACTIONS} />
  );
}
