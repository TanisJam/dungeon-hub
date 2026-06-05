'use client';

// REQ-WCO-WEB-05 / REQ-WCO-WEB-06 / REQ-WCO-WEB-07 — ResourcePanel
// 'use client' island: renders own-character resources with Use/Restore buttons
// and short/long rest buttons. Calls route-local Server Actions; handles
// VERSION_CONFLICT with a toast + router.refresh() per D4.

import { useResource, restoreResource, shortRest, longRest } from '@/app/encuentros/[id]/actions';
import { Button } from '@/components/ui/button';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/lib/use-toast';
import { useEncounterAction } from './use-encounter-action';
import type { ClassResourceView } from '@/lib/sheet-types';

// Display name map — mirrors the subset shown in RecursosTab (recursos.tsx).
// PHB references: Ki Points PHB p.76, Second Wind PHB p.72, etc.
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
  characterId: string;
  encounterId: string;
  resources: ClassResourceView[];
};

export function ResourcePanel({ characterId, encounterId, resources }: Props) {
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
    <div className="flex flex-col gap-3">
      {/* REQ-WCO-WEB-07: VERSION_CONFLICT toast */}
      <Toast message={toast} />

      <FormErrorAlert message={actionError} />

      {/* Resource rows */}
      {resources.map((r) => {
        const remaining = r.max - r.used;
        const name = RESOURCE_LABELS[r.slug] ?? r.slug;
        return (
          <div key={r.slug} className="flex items-center gap-2 py-1">
            <span className="flex-1 text-sm font-medium">{name}</span>
            <span className="text-sm tabular-nums">
              {remaining}&nbsp;/&nbsp;{r.max}
            </span>
            {/* REQ-WCO-WEB-05: Use + Restore buttons — min 44px touch targets */}
            <Button
              tone="ghost"
              size="sm"
              aria-label="Usar"
              disabled={isPending || remaining <= 0}
              onClick={() => handleUse(r.slug)}
              className="min-h-[44px]"
            >
              Usar
            </Button>
            <Button
              tone="ghost"
              size="sm"
              aria-label="Restaurar"
              disabled={isPending || r.used <= 0}
              onClick={() => handleRestore(r.slug)}
              className="min-h-[44px]"
            >
              Restaurar
            </Button>
          </div>
        );
      })}

      {/* Rest buttons — full width, ≥44px touch target */}
      <div className="flex flex-col gap-2 pt-2 border-t border-line">
        <Button
          tone="ghost"
          aria-label="Descanso corto"
          disabled={isPending}
          onClick={handleShortRest}
          fullWidth
        >
          Descanso corto
        </Button>
        <Button
          tone="ghost"
          aria-label="Descanso largo"
          disabled={isPending}
          onClick={handleLongRest}
          fullWidth
        >
          Descanso largo
        </Button>
      </div>
    </div>
  );
}
