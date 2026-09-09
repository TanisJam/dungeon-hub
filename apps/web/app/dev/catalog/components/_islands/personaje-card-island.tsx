'use client';

/**
 * PersonajeCardIsland — catalog demo of PersonajeCard with stubbed active-character button.
 *
 * PersonajeCard is a Server Component that renders SetActiveCharacterButton (a 'use client'
 * child) which, in production, calls setActiveCharacter (server action) + router.refresh().
 * In the catalog we reproduce the card layout with the real CharacterCard + Pill atoms and
 * the real SetActiveCharacterButton driven by injected stub actions — no network, no router.
 *
 * Demonstrates three status variants: active (with star button), pending_approval, and draft.
 * INTERACTIVE — tapping the active card's star activates it locally (one-way, as in prod).
 */

import { useState } from 'react';
import { CharacterCard } from '@/components/ui/character-card';
import { Pill } from '@/components/ui/pill';
import type { PillTone } from '@/components/ui/pill';
import { SetActiveCharacterButton } from '@/components/personajes/set-active-character-button';
import type { RosterCharacter } from '@/components/personajes/types';

const STATUS_LABELS: Record<string, string> = {
  active:           'Activo',
  pending_approval: 'Pendiente DM',
  retired:          'Retirado',
  dead:             'Muerto',
  draft:            'Borrador',
};

const STATUS_TONES: Record<string, PillTone> = {
  active:           'primary',
  pending_approval: 'accent',
  retired:          'stone',
  dead:             'stone',
  draft:            'stone',
};

type FixtureChar = RosterCharacter & { worldId: string };

const FIXTURE_CHARS: FixtureChar[] = [
  {
    id: 'char-brann',
    worldId: 'world-01',
    name: 'Brann Cuervosombrío',
    status: 'active',
    xp: 4200,
    updatedAt: '2024-11-01T00:00:00.000Z',
    lineage: 'Semielfo · Bardo 4',
    hpCurrent: 28,
    hpMax: 36,
  },
  {
    id: 'char-lyra',
    worldId: 'world-01',
    name: 'Lyra Luminosa',
    status: 'pending_approval',
    xp: 0,
    updatedAt: '2024-10-20T00:00:00.000Z',
    lineage: 'Humana · Clérigo 3',
    hpCurrent: null,
    hpMax: null,
  },
  {
    id: 'char-draft',
    worldId: 'world-01',
    name: 'Personaje sin nombre',
    status: 'draft',
    xp: 0,
    updatedAt: '2024-11-02T00:00:00.000Z',
    lineage: '',
    hpCurrent: null,
    hpMax: null,
  },
];

function PersonajeCardCatalog({
  char,
  worldName,
  highlight = false,
}: {
  char: FixtureChar;
  worldName?: string;
  highlight?: boolean;
  activeCharacterId?: string;
}) {
  const [isActive, setIsActive] = useState(highlight);
  const tone: PillTone = STATUS_TONES[char.status] ?? 'stone';
  const label = STATUS_LABELS[char.status] ?? char.status;
  const href =
    char.status === 'draft'
      ? `/characters/${char.id}/wizard`
      : `/characters/${char.id}`;

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
            actions={{ setActive: async () => {}, onActivated: () => setIsActive(true) }}
          />
        ) : null
      }
    >
      <div className="truncate font-display text-[15px] font-bold leading-tight tracking-tight text-ink">
        {char.name}
      </div>
      {char.lineage ? (
        <div className="font-sans text-xs italic text-ink-mute">{char.lineage}</div>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {worldName ? <Pill size="sm" tone="ink">{worldName}</Pill> : null}
        {char.status === 'active' && char.hpCurrent != null && char.hpMax != null ? (
          <Pill size="sm" tone="secondary">HP {char.hpCurrent}/{char.hpMax}</Pill>
        ) : null}
        <Pill size="sm" tone={tone}>{label}</Pill>
        {isActive ? <Pill size="sm" tone="accent">Jugando</Pill> : null}
      </div>
    </CharacterCard>
  );
}

type Props = {
  variant?: 'active' | 'pending' | 'draft';
};

export function PersonajeCardIsland({ variant = 'active' }: Props) {
  const charMap: Record<string, FixtureChar> = {
    active:  FIXTURE_CHARS[0]!,
    pending: FIXTURE_CHARS[1]!,
    draft:   FIXTURE_CHARS[2]!,
  };
  const char = charMap[variant] ?? FIXTURE_CHARS[0]!;
  const highlight = variant === 'active';

  return (
    <PersonajeCardCatalog
      char={char}
      worldName="La Maldición de Strahd"
      highlight={highlight}
      activeCharacterId={highlight ? char.id : undefined}
    />
  );
}
