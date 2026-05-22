'use client';

const ABILITY_LABELS: Record<string, string> = {
  str: 'FUE',
  dex: 'DES',
  con: 'CON',
  int: 'INT',
  wis: 'SAB',
  cha: 'CAR',
};

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

interface StatTileProps {
  ability: string;
  value: number | null;
  isLastSelected: boolean;
  onClick: () => void;
}

export function StatTile({ ability, value, isLastSelected, onClick }: StatTileProps) {
  const label = ABILITY_LABELS[ability] ?? ability.toUpperCase();
  const assigned = value !== null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value ?? 'sin asignar'}`}
      className={[
        'flex flex-col items-center justify-center gap-1 rounded-md p-3 transition-all select-none',
        'border min-h-[80px] w-full',
        assigned
          ? isLastSelected
            ? 'bg-accent-soft border-accent-deep shadow-[0_0_0_2px_var(--color-accent)]'
            : 'bg-surface border-line shadow-stamp-sm'
          : 'bg-paper-soft border-line-soft border-dashed',
        'hover:border-accent active:scale-95',
      ].join(' ')}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-ink-mute">
        {label}
      </span>
      {assigned ? (
        <>
          <span className="font-display text-2xl font-bold text-ink leading-none">{value}</span>
          <span className="text-[10px] text-ink-soft">{modifier(value!)}</span>
        </>
      ) : (
        <span className="text-ink-mute text-xs">—</span>
      )}
    </button>
  );
}
