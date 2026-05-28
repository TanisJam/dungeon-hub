'use client';

import { useState } from 'react';
import { V3Sheet } from '@/components/ui/sheet';
import { PendingFichasCard } from './pending-fichas-card';
import { PendientesSheetContent } from './pendientes-sheet-content';
import type { PendingFichaSummary, QuestSinTocar } from '../dm-mock-data';

type Props = {
  fichas: PendingFichaSummary[];
  oldestAge: string;
  quests: QuestSinTocar[];
};

export function PendingFichasCardTrigger({ fichas, oldestAge, quests }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PendingFichasCard
        fichas={fichas}
        oldestAge={oldestAge}
        onClick={() => setOpen(true)}
      />
      <V3Sheet open={open} onClose={() => setOpen(false)} title="Fichas pendientes">
        <PendientesSheetContent fichas={fichas} quests={quests} />
      </V3Sheet>
    </>
  );
}
