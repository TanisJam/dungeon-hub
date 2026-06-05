import type { AbilityKey } from '@/lib/sheet-types';
import { StatCell } from '@/components/ui/stat-cell';

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
          <StatCell
            key={key}
            surface="paper"
            label={ABILITY_ES[key]}
            value={entry.score}
            sub={fmtMod(entry.modifier)}
          />
        );
      })}
    </div>
  );
}
