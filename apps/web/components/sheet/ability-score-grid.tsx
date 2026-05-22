import type { AbilityKey } from '@/lib/sheet-types';

export interface AbilityScoreEntry {
  score: number;
  modifier: number;
}

interface AbilityScoreGridProps {
  scores: Record<AbilityKey, AbilityScoreEntry>;
}

const ABILITY_ES: Record<AbilityKey, string> = {
  str: 'FUE',
  dex: 'DES',
  con: 'CON',
  int: 'INT',
  wis: 'SAB',
  cha: 'CAR',
};

const ABILITY_ORDER: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export function AbilityScoreGrid({ scores }: AbilityScoreGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {ABILITY_ORDER.map((key) => {
        const entry = scores[key];
        if (!entry) return null;
        return (
          <div
            key={key}
            className="flex flex-col items-center rounded-md bg-paper-soft p-2.5 text-center"
          >
            <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
              {ABILITY_ES[key]}
            </span>
            <span className="font-display text-2xl font-bold text-ink leading-tight">
              {entry.score}
            </span>
            <span className="text-xs text-ink-soft">{fmtMod(entry.modifier)}</span>
          </div>
        );
      })}
    </div>
  );
}
