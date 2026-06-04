import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import type { PillTone } from '@/components/ui/pill';
import { CharacterPortrait } from '@/components/ui/character-portrait';
import { SetActiveCharacterButton } from './set-active-character-button';
import type { RosterCharacter } from './types';

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  pending_approval: 'Pendiente DM',
  retired: 'Retirado',
  dead: 'Muerto',
  draft: 'Borrador',
};

const STATUS_TONES: Record<string, PillTone> = {
  active: 'primary',
  pending_approval: 'accent',
  retired: 'stone',
  dead: 'stone',
  draft: 'stone',
};

export function PersonajeCard({
  char,
  worldName,
  highlight = false,
  activeCharacterId,
}: {
  char: RosterCharacter;
  worldName?: string;
  highlight?: boolean;
  activeCharacterId?: string;
}) {
  const tone: PillTone = STATUS_TONES[char.status] ?? 'stone';
  const label = STATUS_LABELS[char.status] ?? char.status;
  const href =
    char.status === 'draft'
      ? `/characters/${char.id}/wizard`
      : `/characters/${char.id}`;

  // highlight is now driven by char.id === activeCharacterId at the call site.
  // The wrapper div carries the active border — not the Link (ADR F-AFF, ADR F-VIS).
  const isActive = highlight;

  return (
    <div
      className={`flex overflow-hidden rounded-md border bg-surface ${
        isActive ? 'personajes-char-card-active' : 'border-line'
      }`}
    >
      <Link
        href={href}
        className="flex flex-1 transition-colors hover:border-ink-mute"
      >
        <CharacterPortrait name={char.name} className="border-r border-line" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
          <div className="truncate font-display text-[15px] font-bold leading-tight tracking-tight text-ink">
            {char.name}
          </div>
          {char.lineage ? (
            <div data-testid="char-lineage" className="font-sans text-xs italic text-ink-mute">
              {char.lineage}
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {worldName ? <Pill size="sm" tone="ink">{worldName}</Pill> : null}
            {char.status === 'active' && char.hpCurrent != null && char.hpMax != null ? (
              <Pill size="sm" tone="secondary">HP {char.hpCurrent}/{char.hpMax}</Pill>
            ) : null}
            <Pill size="sm" tone={tone}>{label}</Pill>
            {isActive ? (
              <Pill size="sm" tone="accent">Jugando</Pill>
            ) : null}
          </div>
        </div>
        <div className="self-center pr-3 text-xl leading-none text-ink-mute">›</div>
      </Link>
      {char.status === 'active' ? (
        <SetActiveCharacterButton
          characterId={char.id}
          worldId={char.worldId}
          isActive={isActive}
        />
      ) : null}
    </div>
  );
}
