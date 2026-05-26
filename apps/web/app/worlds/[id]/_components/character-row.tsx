/**
 * CharacterRow — Server Component card row for the DM world landing.
 *
 * REQ-WDCL-WEB-LANDING (spec #857). Renders name, owner username,
 * "Class L<level>" pill, status pill, chevron. Tap target ≥44px (set via
 * min-h-[64px] on the link wrapper).
 */
import Link from 'next/link';
import { Card, Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';

export type ListedWorldCharacter = {
  id: string;
  name: string;
  status: 'draft' | 'pending_approval' | 'active' | 'retired' | 'dead';
  classes: Array<{ classSlug: string; level: number }>;
  level: number;
  ownerUserId: string;
  ownerUsername: string;
};

const STATUS_LABELS: Record<ListedWorldCharacter['status'], string> = {
  draft: 'Borrador',
  pending_approval: 'Pendiente',
  active: 'Activo',
  retired: 'Retirado',
  dead: 'Muerto',
};

const STATUS_TONES: Record<ListedWorldCharacter['status'], PillTone> = {
  draft: 'stone',
  pending_approval: 'amber',
  active: 'green',
  retired: 'ink',
  dead: 'ink',
};

function buildClassLabel(character: ListedWorldCharacter): string {
  if (character.classes.length === 0) {
    return `L${character.level}`;
  }
  // For multiclass: show "fighter L3 / wizard L2"; single class: "fighter L5"
  return character.classes
    .map((c) => `${c.classSlug} L${c.level}`)
    .join(' / ');
}

export function CharacterRow({ character }: { character: ListedWorldCharacter }) {
  const statusLabel = STATUS_LABELS[character.status] ?? character.status;
  const statusTone = STATUS_TONES[character.status] ?? 'stone';
  const classLabel = buildClassLabel(character);

  return (
    <li>
      <Link
        href={`/characters/${character.id}`}
        className="block min-h-[64px] transition-opacity hover:opacity-80"
      >
        <Card variant="surface" className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{character.name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-mute">
                {character.ownerUsername} · {classLabel}
              </p>
            </div>
            <Pill tone={statusTone} size="sm">{statusLabel}</Pill>
            <span aria-hidden className="text-ink-mute">›</span>
          </div>
        </Card>
      </Link>
    </li>
  );
}
