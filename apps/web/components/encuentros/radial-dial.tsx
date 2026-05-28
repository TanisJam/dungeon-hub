import type { EncounterCombatant } from './types';

type Props = {
  combatants: EncounterCombatant[];
  currentCombatantId: string;
};

const RADIUS_PCT = 38;

export function RadialDial({ combatants, currentCombatantId }: Props) {
  const sorted = [...combatants].sort(
    (a, b) => b.initiative - a.initiative || a.insertionOrder - b.insertionOrder,
  );
  const current = sorted.find((c) => c.id === currentCombatantId) ?? sorted[0]!;
  const hpPct = current.hpMax > 0 ? current.hpCurrent / current.hpMax : 0;

  return (
    <div className="encuentros-init">
      <div className="encuentros-init-ring" />
      {sorted.map((c, idx) => {
        const angleDeg = (360 / sorted.length) * idx - 90;
        const rad = (angleDeg * Math.PI) / 180;
        const tx = Math.cos(rad) * RADIUS_PCT;
        const ty = Math.sin(rad) * RADIUS_PCT;
        const modifiers = [
          'encuentros-init-token',
          c.kind,
          c.id === currentCombatantId ? 'current' : '',
          c.hpCurrent === 0 ? 'dead' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={c.id}
            data-combatant-id={c.id}
            className={modifiers}
            style={{
              left: `calc(50% + ${tx}%)`,
              top: `calc(50% + ${ty}%)`,
              margin: '-21px 0 0 -21px',
            }}
            title={`${c.name} · Ini ${c.initiative}`}
          >
            {c.name.charAt(0)}
          </div>
        );
      })}
      <div className="encuentros-init-center">
        <div className="eyebrow">Turno</div>
        <div className="name">{current.name}</div>
        <div className="meta">
          Iniciativa {current.initiative} · HP {current.hpCurrent}/{current.hpMax}
        </div>
        <div className="hp-bar">
          <div className="fill" style={{ width: `${(hpPct * 100).toFixed(2)}%` }} />
        </div>
      </div>
    </div>
  );
}
