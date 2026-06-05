'use client';

/**
 * PendingFichasCardTriggerIsland — catalog demo of the DM "pending fichas" card + sheet.
 *
 * Production PendingFichasCardTrigger is a 'use client' component that opens a V3Sheet
 * when the card is clicked. The sheet body is the REAL PendientesSheetContent, fed
 * NOOP_PENDIENTES_ACTIONS so its embedded approve/reject buttons never fire the real
 * server actions in the catalog.
 *
 * INTERACTIVE — opens V3Sheet on tap/click; approve/reject inside run injected stubs.
 */

import { useState } from 'react';
import { V3Sheet } from '@/components/ui/sheet';
import { PendingFichasCard } from '@/components/inicio/dm/pending-fichas-card';
import { PendientesSheetContent } from '@/components/inicio/dm/pendientes-sheet-content';
import type { PendingFichaSummary, QuestSinTocar } from '@/components/inicio/types';
import { NOOP_PENDIENTES_ACTIONS } from './_pendientes-stub';

const FIXTURE_FICHAS: PendingFichaSummary[] = [
  {
    id: 'ficha-lyra',
    portraitInitial: 'L',
    pj: 'Lyra Luminosa',
    lineage: 'Humana · Clérigo 3',
    player: 'elena_r',
    sent: 'hace 3h',
    fresh: true,
  },
  {
    id: 'ficha-korrak',
    portraitInitial: 'K',
    pj: 'Korrak el Impio',
    lineage: 'Orco · Bárbaro 5',
    player: 'matias_g',
    sent: 'hace 1 día',
    fresh: false,
  },
];

const FIXTURE_QUESTS: QuestSinTocar[] = [
  { id: 'quest-1', title: 'El Medallón del Clan Rocaverde', lastChange: 'hace 3 días' },
  { id: 'quest-2', title: 'Vengar a Sildar',                lastChange: 'hace 6 días' },
];

export function PendingFichasCardTriggerIsland() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PendingFichasCard
        fichas={FIXTURE_FICHAS}
        oldestAge="hace 1 día"
        onClick={() => setOpen(true)}
      />
      <V3Sheet open={open} onClose={() => setOpen(false)} title="Fichas pendientes">
        <PendientesSheetContent
          fichas={FIXTURE_FICHAS}
          quests={FIXTURE_QUESTS}
          actions={NOOP_PENDIENTES_ACTIONS}
        />
      </V3Sheet>
    </>
  );
}
