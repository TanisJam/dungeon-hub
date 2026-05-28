import { Pill } from '@/components/ui/pill';
import type { EncounterCombatant } from './types';

type Props = {
  combatants: EncounterCombatant[];
  currentCombatantId: string;
};

export function RosterList({ combatants, currentCombatantId }: Props) {
  const sorted = [...combatants].sort(
    (a, b) => b.initiative - a.initiative || a.insertionOrder - b.insertionOrder,
  );

  return (
    <ul className="encuentros-init-list">
      {sorted.map((c) => {
        const isCurrent = c.id === currentCombatantId;
        const isDead = c.hpCurrent === 0;
        const rowClass = [
          'encuentros-init-row',
          isCurrent ? 'current' : '',
          isDead ? 'dead' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li
            key={c.id}
            data-combatant-id={c.id}
            className={rowClass}
            style={isDead ? { opacity: 0.45 } : undefined}
          >
            <span className="ini">{c.initiative}</span>
            <span className="nm">{c.name}</span>
            <span className="hp">
              {c.hpCurrent}/{c.hpMax}
            </span>
            <Pill size="sm" tone={c.kind === 'pc' ? 'green' : 'pink'}>
              {c.kind === 'pc' ? 'PC' : 'NPC'}
            </Pill>
          </li>
        );
      })}
    </ul>
  );
}
