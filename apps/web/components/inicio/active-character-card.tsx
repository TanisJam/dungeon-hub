import Link from 'next/link';
import { Pill, SectionHead } from '@/components/ui';
import type { ActiveCharacter } from './mock-data';

interface ActiveCharacterCardProps {
  char: ActiveCharacter;
}

export function ActiveCharacterCard({ char }: ActiveCharacterCardProps) {
  const initLabel = char.init >= 0 ? `+${char.init}` : `${char.init}`;

  return (
    <>
      <SectionHead title="Tu personaje activo" />
      <Link
        href={`/characters/${char.id}`}
        className="flex overflow-hidden rounded-md border border-accent bg-surface ring-1 ring-accent/30 transition-colors hover:border-accent"
      >
        <div className="grid w-[72px] shrink-0 place-items-center border-r border-accent bg-gradient-to-br from-[#2E1A28] to-[#1A1726] font-display text-[26px] font-bold text-accent">
          {char.initial}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
          <div className="font-display text-[15px] font-bold leading-tight tracking-tight text-ink">
            {char.name}
          </div>
          <div className="font-sans text-xs italic text-ink-mute">{char.lineage}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Pill size="sm" tone="coral">HP {char.hp}</Pill>
            <Pill size="sm" tone="green">AC {char.ac}</Pill>
            <Pill size="sm" tone="stone">Init {initLabel}</Pill>
          </div>
        </div>
        <div className="self-center pr-3 text-xl leading-none text-ink-mute">›</div>
      </Link>
    </>
  );
}
