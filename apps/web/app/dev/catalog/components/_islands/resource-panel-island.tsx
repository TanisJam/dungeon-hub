'use client';

// Dev-only catalog island for ResourcePanelView.
// Uses ResourcePanelView directly with fixture props + local React state
// (no server actions called — catalog visualization only).

import { useState } from 'react';
import { useToast } from '@/lib/use-toast';
import { ResourcePanelView } from '@/components/encuentros/resource-panel-view';
import type { ClassResourceView } from '@/lib/sheet-types';

type Props = {
  resources: ClassResourceView[];
};

export function ResourcePanelIsland({ resources }: Props) {
  const { message: toast, showToast } = useToast();
  const [localResources, setLocalResources] = useState<ClassResourceView[]>(resources);

  function handleUse(slug: string) {
    setLocalResources((prev) =>
      prev.map((r) => (r.slug === slug && r.used < r.max ? { ...r, used: r.used + 1 } : r)),
    );
    showToast('(Catálogo) Recurso usado — sin acción de servidor real.');
  }

  function handleRestore(slug: string) {
    setLocalResources((prev) =>
      prev.map((r) => (r.slug === slug && r.used > 0 ? { ...r, used: r.used - 1 } : r)),
    );
    showToast('(Catálogo) Recurso restaurado — sin acción de servidor real.');
  }

  function handleShortRest() {
    showToast('(Catálogo) Descanso corto — sin acción de servidor real.');
  }

  function handleLongRest() {
    setLocalResources((prev) => prev.map((r) => ({ ...r, used: 0 })));
    showToast('(Catálogo) Descanso largo — recursos reiniciados localmente.');
  }

  return (
    <ResourcePanelView
      resources={localResources}
      pending={false}
      actionError={null}
      toastMessage={toast}
      onUse={handleUse}
      onRestore={handleRestore}
      onShortRest={handleShortRest}
      onLongRest={handleLongRest}
    />
  );
}
