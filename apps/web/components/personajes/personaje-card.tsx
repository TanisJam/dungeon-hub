import Link from 'next/link';
import { Pill } from '@/components/ui/pill';
import type { PillTone } from '@/components/ui/pill';
import type { RosterCharacter } from './types';

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  pending_approval: 'Pendiente DM',
  retired: 'Retirado',
  dead: 'Muerto',
};

const STATUS_TONES: Record<string, PillTone> = {
  active: 'green',
  pending_approval: 'amber',
  retired: 'stone',
  dead: 'stone',
};

export function PersonajeCard({
  char,
  worldName,
  highlight = false,
}: {
  char: RosterCharacter;
  worldName?: string;
  highlight?: boolean;
}) {
  const initial = char.name.trim().charAt(0).toUpperCase() || '?';
  const tone: PillTone = STATUS_TONES[char.status] ?? 'stone';
  const label = STATUS_LABELS[char.status] ?? char.status;

  return (
    <Link
      href={`/characters/${char.id}`}
      className={`flex overflow-hidden rounded-md border bg-surface transition-colors hover:border-ink-mute ${
        highlight ? 'personajes-char-card-active' : 'border-line'
      }`}
    >
      <div className="grid w-[72px] shrink-0 place-items-center border-r border-line bg-gradient-to-br from-[#2E1A28] to-[#1A1726] font-display text-[26px] font-bold text-accent">
        {initial}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
        <div className="truncate font-display text-[15px] font-bold leading-tight tracking-tight text-ink">
          {char.name}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {worldName ? <Pill size="sm" tone="ink">{worldName}</Pill> : null}
          <Pill size="sm" tone={tone}>{label}</Pill>
        </div>
      </div>
      <div className="self-center pr-3 text-xl leading-none text-ink-mute">›</div>
    </Link>
  );
}
