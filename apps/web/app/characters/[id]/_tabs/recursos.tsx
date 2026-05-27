'use client';

import { useTransition } from 'react';
import type { ClassResourceView } from '@/lib/sheet-types';
import { isBardicInspirationExtra } from '@/lib/sheet-types';
import { Card } from '@/components/ui';
import { useClassResource, restoreClassResource } from '../actions';

interface RecursosTabProps {
  characterId: string;
  classResources: Record<string, ClassResourceView>;
}

/**
 * Resource display name + class label. Keep in sync with the registry
 * (`packages/domain/src/character/class-resources/registry.ts`). For the
 * canonical-2 ship, both entries are hardcoded here; future SDDs that add
 * more resources should follow the same shape.
 */
const RESOURCE_LABELS: Record<string, { name: string; classLabel: string }> = {
  'fighter:second-wind': { name: 'Segundo Aire', classLabel: 'Guerrero' },
  'monk:ki-points': { name: 'Puntos de Ki', classLabel: 'Monje' },
  'bard:bardic-inspiration': { name: 'Inspiración bárdica', classLabel: 'Bardo' },
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
  const canUse = resource.used < resource.max && !pending;
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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={!canUse}
          onClick={() =>
            startTransition(async () => {
              await useClassResource(characterId, resource.slug);
            })
          }
          className="flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft disabled:opacity-50 disabled:hover:bg-paper"
        >
          Usar
        </button>
        <button
          type="button"
          disabled={!canRestore}
          onClick={() =>
            startTransition(async () => {
              await restoreClassResource(characterId, resource.slug);
            })
          }
          className="flex-1 rounded-md border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft disabled:opacity-50 disabled:hover:bg-paper"
        >
          Restaurar
        </button>
      </div>
    </Card>
  );
}
