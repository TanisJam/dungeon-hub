'use client';

// NOTE: mirrors ResourcePanel (apps/web/components/encuentros/resource-panel.tsx)
// Dev-only catalog island — supplies fixture ClassResourceView[] + stub/no-op handlers.
// Server actions (useResource, restoreResource, shortRest, longRest) are NOT called;
// buttons are interactive but produce no server mutation.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/lib/use-toast';
import type { ClassResourceView } from '@/lib/sheet-types';

const RESOURCE_LABELS: Record<string, string> = {
  'fighter:second-wind': 'Segundo Aire',
  'fighter:indomitable': 'Indómito',
  'monk:ki-points': 'Puntos de Ki',
  'bard:bardic-inspiration': 'Inspiración bárdica',
  'paladin:lay-on-hands': 'Imposición de Manos',
  'paladin:channel-divinity': 'Conducto Divino',
  'cleric:channel-divinity': 'Conducto Divino',
  'wizard:arcane-recovery': 'Recuperación Arcana',
  'sorcerer:sorcery-points': 'Puntos de Hechicería',
  'druid:natural-recovery': 'Recuperación Natural',
};

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
    <div className="flex flex-col gap-3">
      <Toast message={toast} />

      {localResources.map((r) => {
        const remaining = r.max - r.used;
        const name = RESOURCE_LABELS[r.slug] ?? r.slug;
        return (
          <div key={r.slug} className="flex items-center gap-2 py-1">
            <span className="flex-1 text-sm font-medium">{name}</span>
            <span className="text-sm tabular-nums">
              {remaining}&nbsp;/&nbsp;{r.max}
            </span>
            <Button
              tone="ghost"
              size="sm"
              aria-label="Usar"
              disabled={remaining <= 0}
              onClick={() => handleUse(r.slug)}
              className="min-h-[44px]"
            >
              Usar
            </Button>
            <Button
              tone="ghost"
              size="sm"
              aria-label="Restaurar"
              disabled={r.used <= 0}
              onClick={() => handleRestore(r.slug)}
              className="min-h-[44px]"
            >
              Restaurar
            </Button>
          </div>
        );
      })}

      <div className="flex flex-col gap-2 pt-2 border-t border-line">
        <Button
          tone="ghost"
          aria-label="Descanso corto"
          onClick={handleShortRest}
          fullWidth
        >
          Descanso corto
        </Button>
        <Button
          tone="ghost"
          aria-label="Descanso largo"
          onClick={handleLongRest}
          fullWidth
        >
          Descanso largo
        </Button>
      </div>
    </div>
  );
}
