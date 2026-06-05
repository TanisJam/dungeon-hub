'use client';

import { StatCell } from '@/components/ui/stat-cell';

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

  return (
    <StatCell
      label={label}
      value={value}
      sub={value !== null ? modifier(value) : undefined}
      selected={isLastSelected}
      onClick={onClick}
      ariaLabel={`${label}: ${value ?? 'sin asignar'}`}
    />
  );
}
