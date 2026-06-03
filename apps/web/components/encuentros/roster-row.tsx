import { Pill } from '@/components/ui/pill';
import { ConditionBadges } from './condition-badges';
import type { EncounterCombatant } from './types';

type Props = {
  combatants: EncounterCombatant[];
  currentCombatantId: string;
  // REQ-WCO-WEB-04: action economy shown for own combatant only
  ownCombatantId?: string | null;
};

export function RosterList({ combatants, currentCombatantId, ownCombatantId }: Props) {
  const sorted = [...combatants].sort(
    (a, b) => b.initiative - a.initiative || a.insertionOrder - b.insertionOrder,
  );

  return (
    <ul className="encuentros-init-list">
      {sorted.map((c) => {
        const isCurrent = c.id === currentCombatantId;
        const isDead = c.hpCurrent === 0;
        const isOwn = ownCombatantId != null && c.id === ownCombatantId;
        const rowClass = [
          'encuentros-init-row',
          isCurrent ? 'current' : '',
          isDead ? 'dead' : '',
        ]
          .filter(Boolean)
          .join(' ');

        // Derive string arrays for ConditionBadges
        const conditionNames = c.conditions.map((cd) => cd.name);
        const effectNames = c.effects.map((ef) => ef.name);

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
            <Pill size="sm" tone={c.kind === 'pc' ? 'primary' : 'accent'}>
              {c.kind === 'pc' ? 'PC' : 'NPC'}
            </Pill>

            {/* REQ-WCO-WEB-03: condition + effect badges for all combatants */}
            {(conditionNames.length > 0 || effectNames.length > 0) && (
              <ConditionBadges conditions={conditionNames} effects={effectNames} />
            )}

            {/* REQ-WCO-WEB-04: action economy indicators for own row only */}
            {isOwn && (
              <span
                data-action-economy
                className="flex gap-1 text-xs text-ink-soft"
                aria-label="Economía de turno"
              >
                <span
                  title="Acción"
                  className={c.actionUsed ? 'opacity-40' : 'opacity-100'}
                  aria-label={c.actionUsed ? 'Acción usada' : 'Acción disponible'}
                >
                  A
                </span>
                <span
                  title="Acción adicional"
                  className={c.bonusActionUsed ? 'opacity-40' : 'opacity-100'}
                  aria-label={c.bonusActionUsed ? 'Acción adicional usada' : 'Acción adicional disponible'}
                >
                  B
                </span>
                <span
                  title="Reacción"
                  className={c.reactionUsed ? 'opacity-40' : 'opacity-100'}
                  aria-label={c.reactionUsed ? 'Reacción usada' : 'Reacción disponible'}
                >
                  R
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
