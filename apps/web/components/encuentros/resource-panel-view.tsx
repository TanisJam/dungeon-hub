'use client';

// REQ-WCO-WEB-05 / REQ-WCO-WEB-06 / REQ-WCO-WEB-07 — ResourcePanelView pure presentational layer.
// All state is derived externally; this component only renders.
// Mobile-first 375px: Use/Restore buttons ≥44px, rest buttons full-width ≥44px (CLAUDE.md §2).

import { Button } from '@/components/ui/button';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { Toast } from '@/components/ui/toast';
import type { ClassResourceView } from '@/lib/sheet-types';

// Display name map — mirrors the subset shown in RecursosTab (recursos.tsx).
// PHB references: Ki Points PHB p.76, Second Wind PHB p.72, etc.
export const RESOURCE_LABELS: Record<string, string> = {
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

export type ResourcePanelViewProps = {
  resources: ClassResourceView[];
  pending: boolean;
  actionError: string | null;
  toastMessage: string | null;
  onUse: (slug: string) => void;
  onRestore: (slug: string) => void;
  onShortRest: () => void;
  onLongRest: () => void;
};

export function ResourcePanelView({
  resources,
  pending,
  actionError,
  toastMessage,
  onUse,
  onRestore,
  onShortRest,
  onLongRest,
}: ResourcePanelViewProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* REQ-WCO-WEB-07: VERSION_CONFLICT toast */}
      <Toast message={toastMessage} />

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
              disabled={pending || remaining <= 0}
              onClick={() => onUse(r.slug)}
              className="min-h-[44px]"
            >
              Usar
            </Button>
            <Button
              tone="ghost"
              size="sm"
              aria-label="Restaurar"
              disabled={pending || r.used <= 0}
              onClick={() => onRestore(r.slug)}
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
          disabled={pending}
          onClick={onShortRest}
          fullWidth
        >
          Descanso corto
        </Button>
        <Button
          tone="ghost"
          aria-label="Descanso largo"
          disabled={pending}
          onClick={onLongRest}
          fullWidth
        >
          Descanso largo
        </Button>
      </div>
    </div>
  );
}
