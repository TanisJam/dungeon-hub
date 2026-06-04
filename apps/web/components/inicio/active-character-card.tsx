import { Pill, SectionHead } from '@/components/ui';
import { CharacterCard } from '@/components/ui/character-card';
import type { ActiveCharacter } from './types';

interface ActiveCharacterCardProps {
  char: ActiveCharacter;
}

export function ActiveCharacterCard({ char }: ActiveCharacterCardProps) {
  const initLabel = char.init >= 0 ? `+${char.init}` : `${char.init}`;

  return (
    <>
      <SectionHead title="Tu personaje activo" />
      <CharacterCard
        href={`/characters/${char.id}`}
        name={char.name}
        portraitClassName="border-r border-accent"
        className="border-accent ring-1 ring-accent/30 hover:border-accent"
      >
        <div className="font-display text-[15px] font-bold leading-tight tracking-tight text-ink">
          {char.name}
        </div>
        <div className="font-sans text-xs italic text-ink-mute">{char.lineage}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Pill size="sm" tone="secondary">HP {char.hp}</Pill>
          <Pill size="sm" tone="primary">AC {char.ac}</Pill>
          <Pill size="sm" tone="stone">Init {initLabel}</Pill>
        </div>
      </CharacterCard>
    </>
  );
}
