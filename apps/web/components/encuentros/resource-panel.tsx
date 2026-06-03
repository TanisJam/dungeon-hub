'use client';

// REQ-WCO-WEB-05 / REQ-WCO-WEB-06 / REQ-WCO-WEB-07 — ResourcePanel
// 'use client' island: renders own-character resources with Use/Restore buttons
// and short/long rest buttons. Calls route-local Server Actions; handles
// VERSION_CONFLICT with a toast + router.refresh() per D4.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ClassResourceView } from '@/lib/sheet-types';
import { useResource, restoreResource, shortRest, longRest } from '@/app/encuentros/[id]/actions';

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
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleUse(slug: string) {
    startTransition(async () => {
      setActionError(null);
      const result = await useResource(characterId, encounterId, slug);
      if (!result.ok) {
        if (result.code === 'VERSION_CONFLICT') {
          // REQ-WCO-WEB-07: stale-page handling
          showToast('El estado cambió, actualizando...');
          router.refresh();
        } else {
          setActionError(result.message ?? 'Error al usar el recurso');
        }
      }
    });
  }

  async function handleRestore(slug: string) {
    startTransition(async () => {
      setActionError(null);
      const result = await restoreResource(characterId, encounterId, slug);
      if (!result.ok) {
        if (result.code === 'VERSION_CONFLICT') {
          showToast('El estado cambió, actualizando...');
          router.refresh();
        } else {
          setActionError(result.message ?? 'Error al restaurar el recurso');
        }
      }
    });
  }

  async function handleShortRest() {
    startTransition(async () => {
      setActionError(null);
      const result = await shortRest(characterId, encounterId);
      if (!result.ok) {
        setActionError(result.message ?? 'Error al realizar descanso corto');
      }
    });
  }

  async function handleLongRest() {
    startTransition(async () => {
      setActionError(null);
      const result = await longRest(characterId, encounterId);
      if (!result.ok) {
        setActionError(result.message ?? 'Error al realizar descanso largo');
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* REQ-WCO-WEB-07: VERSION_CONFLICT toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="text-xs text-center px-3 py-2 bg-warning-soft text-warning-deep rounded"
        >
          {toast}
        </div>
      )}

      {actionError && (
        <p className="text-xs text-red-600" role="alert">{actionError}</p>
      )}

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
            <button
              type="button"
              aria-label="Usar"
              disabled={isPending || remaining <= 0}
              onClick={() => handleUse(r.slug)}
              className="min-h-[44px] px-3 text-xs font-semibold rounded border border-line disabled:opacity-40"
            >
              Usar
            </button>
            <button
              type="button"
              aria-label="Restaurar"
              disabled={isPending || r.used <= 0}
              onClick={() => handleRestore(r.slug)}
              className="min-h-[44px] px-3 text-xs font-semibold rounded border border-line disabled:opacity-40"
            >
              Restaurar
            </button>
          </div>
        );
      })}

      {/* Rest buttons — full width, ≥44px touch target */}
      <div className="flex flex-col gap-2 pt-2 border-t border-line">
        <button
          type="button"
          aria-label="Descanso corto"
          disabled={isPending}
          onClick={handleShortRest}
          className="w-full min-h-[44px] rounded text-sm font-semibold border border-line disabled:opacity-40"
        >
          Descanso corto
        </button>
        <button
          type="button"
          aria-label="Descanso largo"
          disabled={isPending}
          onClick={handleLongRest}
          className="w-full min-h-[44px] rounded text-sm font-semibold border border-line disabled:opacity-40"
        >
          Descanso largo
        </button>
      </div>
    </div>
  );
}
