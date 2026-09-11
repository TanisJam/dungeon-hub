import { Pill } from '@/components/ui/pill';
import type { PillTone } from '@/components/ui/pill';
import { CharacterCard } from '@/components/ui/character-card';
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
    <CharacterCard
      href={href}
      name={char.name}
      portraitClassName="border-r border-line"
      className={isActive ? 'personajes-char-card-active' : 'border-line'}
      action={
        char.status === 'active' ? (
          <SetActiveCharacterButton
            characterId={char.id}
            worldId={char.worldId}
            isActive={isActive}
          />
        ) : null
      }
    >
      {/*
        data-testid, like the sibling char-lineage below: the name is what tests
        read off a roster card, and the only handle it had was the `truncate`
        utility class. ui-craft F11 (29553c4) swapped that for `line-clamp-2` so a
        long name wraps instead of escaping the card — a purely visual decision —
        and active-character.auth.spec.ts started timing out on a selector that
        could no longer match. A styling class is the most brittle possible
        selector: it is meant to change.
      */}
      <div
        data-testid="char-name"
        className="line-clamp-2 font-display text-body font-bold leading-tight tracking-tight text-ink"
      >
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
    </CharacterCard>
  );
}
