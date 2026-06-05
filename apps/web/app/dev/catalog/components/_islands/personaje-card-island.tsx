'use client';

/**
 * PersonajeCardIsland — catalog demo of PersonajeCard with stubbed active-character button.
 *
 * PersonajeCard is a Server Component that renders SetActiveCharacterButton (a 'use client'
 * child) which calls setActiveCharacter (server action) + router.refresh(). In the catalog
 * we reproduce the full card layout using the real CharacterCard + Pill atoms and an inline
 * stub button — identical visual, no network or router dependency.
 *
 * Demonstrates three status variants: active (with star button), pending_approval, and draft.
 * INTERACTIVE — active card star button toggles fill state locally.
 */

import { useState } from 'react';
import { CharacterCard } from '@/components/ui/character-card';
import { Pill } from '@/components/ui/pill';
import type { PillTone } from '@/components/ui/pill';
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
  activeCharacterId,
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
          <button
            type="button"
            onClick={() => setIsActive((p) => !p)}
            aria-label={isActive ? 'Personaje activo' : 'Seleccionar como personaje activo'}
            aria-pressed={isActive}
            className={`flex min-h-[44px] w-[44px] shrink-0 items-center justify-center rounded-r-md transition-colors ${
              isActive ? 'text-accent' : 'text-ink-mute hover:text-accent'
            }`}
          >
            {isActive ? '★' : '☆'}
          </button>
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
