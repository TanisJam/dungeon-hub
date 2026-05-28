'use client';

import { useState, useTransition } from 'react';
import type { ClassResourceView } from '@/lib/sheet-types';
import { isBardicInspirationExtra, isPoolShapeExtra } from '@/lib/sheet-types';
import { Card } from '@/components/ui';
import { useClassResource, restoreClassResource } from '../actions';

interface RecursosTabProps {
  characterId: string;
  classResources: Record<string, ClassResourceView>;
}

/**
 * Resource display name + class label. Keep in sync with the registry
 * (`packages/domain/src/character/class-resources/registry.ts`). Future SDDs
 * that add more resources append entries here; consider promoting to an
 * i18n registry once the list outgrows manual maintenance.
 */
const RESOURCE_LABELS: Record<string, { name: string; classLabel: string }> = {
  'fighter:second-wind': { name: 'Segundo Aire', classLabel: 'Guerrero' },
  'fighter:indomitable': { name: 'Indómito', classLabel: 'Guerrero' },
  'monk:ki-points': { name: 'Puntos de Ki', classLabel: 'Monje' },
  'bard:bardic-inspiration': { name: 'Inspiración bárdica', classLabel: 'Bardo' },
  'paladin:lay-on-hands': { name: 'Imposición de Manos', classLabel: 'Paladín' },
  'paladin:channel-divinity': { name: 'Conducto Divino', classLabel: 'Paladín' },
  'cleric:channel-divinity': { name: 'Conducto Divino', classLabel: 'Clérigo' },
  'wizard:arcane-recovery': { name: 'Recuperación Arcana', classLabel: 'Mago' },
  'sorcerer:sorcery-points': { name: 'Puntos de Hechicería', classLabel: 'Hechicero' },
  'druid:natural-recovery': { name: 'Recuperación Natural', classLabel: 'Druida (Tierra)' },
};

const TRIGGER_LABEL: Record<ClassResourceView['recoveryTrigger'], string> = {
  short: 'descanso corto',
  long: 'descanso largo',
  both: 'descanso corto o largo',
};

export function RecursosTab({ characterId, classResources }: RecursosTabProps) {
  const entries = Object.values(classResources);

  if (entries.length === 0) {
    return (
      <Card variant="surface" className="px-4 py-10 text-center">
        <p className="text-sm text-ink-mute">
          Tu personaje aún no tiene recursos de clase rastreables.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((resource) => (
        <ResourceRow key={resource.slug} characterId={characterId} resource={resource} />
      ))}
    </div>
  );
}

function ResourceRow({
  characterId,
  resource,
}: {
  characterId: string;
  resource: ClassResourceView;
}) {
  const [pending, startTransition] = useTransition();
  const labels = RESOURCE_LABELS[resource.slug];
  const name = labels?.name ?? resource.slug;
  const classLabel = labels?.classLabel ?? resource.classSlug;
  const triggerLabel = TRIGGER_LABEL[resource.recoveryTrigger];
  const isPool = isPoolShapeExtra(resource.extra);
  const [amount, setAmount] = useState(1);
  const remaining = resource.max - resource.used;
  const useAmount = isPool ? Math.min(Math.max(amount, 1), Math.max(remaining, 1)) : 1;
  const restoreAmount = isPool ? Math.min(Math.max(amount, 1), Math.max(resource.used, 1)) : 1;
  const canUse = remaining > 0 && !pending;
  const canRestore = resource.used > 0 && !pending;

  return (
    <Card variant="surface" className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-mute">
            {classLabel} · recupera con {triggerLabel}
          </p>
        </div>
        <span className="flex-shrink-0 font-display text-lg font-bold text-ink">
          {resource.used}
          <span className="text-sm text-ink-mute"> / {resource.max}</span>
        </span>
      </div>

      {isBardicInspirationExtra(resource.extra) && (
        <div className="mt-2">
          <span
            data-testid="resource-die-badge"
            className="inline-flex items-center rounded-full border border-line bg-paper-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-mute"
          >
            {resource.extra.dieSize}
          </span>
        </div>
      )}

      {isPool && (
        <div className="mt-3">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-ink-mute">
            Cantidad
            <input
              data-testid="resource-amount-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={resource.max}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              disabled={pending}
              className="mt-1 h-11 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink disabled:opacity-50"
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canUse}
          onClick={() =>
            startTransition(async () => {
              await useClassResource(characterId, resource.slug, isPool ? useAmount : undefined);
            })
          }
          className="min-h-[44px] flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft disabled:opacity-50 disabled:hover:bg-paper"
        >
          Usar
        </button>
        <button
          type="button"
          disabled={!canRestore}
          onClick={() =>
            startTransition(async () => {
              await restoreClassResource(
                characterId,
                resource.slug,
                isPool ? restoreAmount : undefined,
              );
            })
          }
          className="min-h-[44px] flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft disabled:opacity-50 disabled:hover:bg-paper"
        >
          Restaurar
        </button>
      </div>
    </Card>
  );
}
