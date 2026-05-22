interface VitalGridProps {
  hp: { current: number | null; max: number | null };
  ac: number | null;
  initiative: number | null;
}

function dash(value: number | null): string {
  return value === null ? '—' : String(value);
}

function formatInitiative(value: number | null): string {
  if (value === null) return '—';
  return value >= 0 ? `+${value}` : String(value);
}

export function VitalGrid({ hp, ac, initiative }: VitalGridProps) {
  // currentHp null means "no live HP tracking yet" — default to max (full HP).
  const effectiveCurrent = hp.current ?? hp.max;
  const hpDisplay =
    effectiveCurrent === null && hp.max === null
      ? '—'
      : `${dash(effectiveCurrent)} / ${dash(hp.max)}`;

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* HP */}
      <div
        className="flex flex-col items-center rounded-md px-3 py-4 text-center"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(232,148,111,0.25), transparent 70%), linear-gradient(180deg, rgba(232,148,111,0.12) 0%, transparent 100%)',
          border: '1px solid rgba(232,148,111,0.3)',
        }}
      >
        <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">HP</span>
        <span className="font-display text-lg font-bold text-ink leading-tight">{hpDisplay}</span>
      </div>

      {/* AC */}
      <div className="flex flex-col items-center rounded-md bg-surface border border-line px-3 py-4 text-center">
        <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">CA</span>
        <span className="font-display text-2xl font-bold text-ink leading-tight">{dash(ac)}</span>
      </div>

      {/* Initiative */}
      <div className="flex flex-col items-center rounded-md bg-surface border border-line px-3 py-4 text-center">
        <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">INI</span>
        <span className="font-display text-2xl font-bold text-ink leading-tight">
          {formatInitiative(initiative)}
        </span>
      </div>
    </div>
  );
}
