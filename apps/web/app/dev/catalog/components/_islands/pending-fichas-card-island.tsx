'use client';

/**
 * PendingFichasCardIsland — catalog demo of PendingFichasCard in isolation.
 *
 * PendingFichasCard is a presentational <button> component that receives an onClick
 * handler from its parent (PendingFichasCardTrigger). Here we supply a no-op handler
 * and fixture fichas so the card can be inspected on its own without the sheet overlay.
 *
 * INTERACTIVE — onClick stub logs "(catalog) click" to console; no sheet opened here.
 * For the full trigger+sheet flow see PendingFichasCardTriggerIsland.
 */

import { PendingFichasCard } from '@/components/inicio/dm/pending-fichas-card';
import type { PendingFichaSummary } from '@/components/inicio/types';

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

export function PendingFichasCardIsland() {
  return (
    <PendingFichasCard
      fichas={FIXTURE_FICHAS}
      oldestAge="hace 1 día"
      onClick={() => {/* catalog stub — PendingFichasCardTriggerIsland opens the full sheet */}}
    />
  );
}
