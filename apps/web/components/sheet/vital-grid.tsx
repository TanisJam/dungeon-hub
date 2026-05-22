interface VitalGridProps {
  hp: { current: number | null; max: number | null };
  ac: number | null;
  initiative: number | null;
  armorFormula?: string;
  walkSpeed?: number;
}

function dash(value: number | null): string {
  return value === null ? '—' : String(value);
}

function formatInitiative(value: number | null): string {
  if (value === null) return '—';
  return value >= 0 ? `+${value}` : String(value);
}

export function VitalGrid({ hp, ac, initiative, armorFormula, walkSpeed }: VitalGridProps) {
  const effectiveCurrent = hp.current ?? hp.max;
  const hpDisplay =
    effectiveCurrent === null && hp.max === null
      ? '—'
      : `${dash(effectiveCurrent)} / ${dash(hp.max)}`;

  const hpFill =
    hp.max !== null && hp.max > 0 && effectiveCurrent !== null
      ? Math.min(100, Math.round((effectiveCurrent / hp.max) * 100))
      : 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* HP — peach gradient */}
      <div
        className="flex flex-col items-center rounded-md px-3 py-4 text-center"
        style={{
          background:
            'linear-gradient(135deg, rgba(251,229,216,0.9) 0%, rgba(232,148,111,0.3) 100%)',
          border: '1px solid rgba(232,148,111,0.3)',
        }}
      >
        <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
          Puntos de Golpe
        </span>
        <span className="font-display text-lg font-bold text-ink leading-tight mt-0.5">
          {hpDisplay}
        </span>
        {hp.max !== null && hp.max > 0 && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-accent/20">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${hpFill}%` }}
            />
          </div>
        )}
      </div>

      {/* AC */}
      <div className="flex flex-col items-center rounded-md bg-surface border border-line px-3 py-4 text-center">
        <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
          Clase Armadura
        </span>
        <span className="font-display text-2xl font-bold text-ink leading-tight mt-0.5">
          {dash(ac)}
        </span>
        {armorFormula && (
          <span className="mt-1 text-[9px] text-ink-mute leading-tight truncate max-w-full">
            {armorFormula}
          </span>
        )}
      </div>

      {/* Initiative */}
      <div className="flex flex-col items-center rounded-md bg-surface border border-line px-3 py-4 text-center">
        <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
          Iniciativa
        </span>
        <span className="font-display text-2xl font-bold text-ink leading-tight mt-0.5">
          {formatInitiative(initiative)}
        </span>
        {walkSpeed !== undefined && (
          <span className="mt-1 text-[9px] text-ink-mute leading-tight">
            {walkSpeed} ft vel.
          </span>
        )}
      </div>
    </div>
  );
}
