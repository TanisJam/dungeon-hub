'use client';

import { useTransition } from 'react';
import { TurnControls } from './turn-controls';
import { advanceEncounterTurn } from '@/app/encuentros/actions';

type Props = {
  encounterId: string;
  version: number;
};

export function TurnControlsIsland({ encounterId, version }: Props) {
  const [isPending, startTransition] = useTransition();
  const onAdvance = () => {
    startTransition(async () => {
      await advanceEncounterTurn(encounterId, version);
    });
  };
  return <TurnControls onAdvance={onAdvance} pending={isPending} />;
}
