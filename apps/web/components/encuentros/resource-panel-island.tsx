'use client';

// REQ-WCO-WEB-05 / REQ-WCO-WEB-06 / REQ-WCO-WEB-07 — ResourcePanelIsland container layer.
// Owns: useToast, useEncounterAction, all handler thunks.
// Renders ResourcePanelView with all derived state.
// Public prop interface is identical to the former ResourcePanel monolith.
// VERSION_CONFLICT → toast + router.refresh() per D4.

import { useResource, restoreResource, shortRest, longRest } from '@/app/encuentros/[id]/actions';
import { useToast } from '@/lib/use-toast';
import { useEncounterAction } from './use-encounter-action';
import { ResourcePanelView } from './resource-panel-view';
import type { ClassResourceView } from '@/lib/sheet-types';

type Props = {
  characterId: string;
  encounterId: string;
  resources: ClassResourceView[];
};

export function ResourcePanelIsland({ characterId, encounterId, resources }: Props) {
  const { message: toast, showToast } = useToast();
  const { isPending, actionError, runAction } = useEncounterAction({
    onConflict: () => showToast('El estado cambió, actualizando...'),
  });

  function handleUse(slug: string) {
    runAction(() => useResource(characterId, encounterId, slug));
  }

  function handleRestore(slug: string) {
    runAction(() => restoreResource(characterId, encounterId, slug));
  }

  function handleShortRest() {
    runAction(() => shortRest(characterId, encounterId));
  }

  function handleLongRest() {
    runAction(() => longRest(characterId, encounterId));
  }

  return (
    <ResourcePanelView
      resources={resources}
      pending={isPending}
      actionError={actionError}
      toastMessage={toast}
      onUse={handleUse}
      onRestore={handleRestore}
      onShortRest={handleShortRest}
      onLongRest={handleLongRest}
    />
  );
}
