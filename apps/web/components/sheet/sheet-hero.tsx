const XP_TABLE = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= 20) return XP_TABLE[19];
  return XP_TABLE[level - 1];
}

interface SheetHeroProps {
  name: string;
  raceLabel?: string;
  classLabel?: string;
  subclassLabel?: string;
  level: number;
  xpCurrent: number;
  xpNextThreshold: number;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

export function SheetHero({
  name,
  raceLabel,
  classLabel,
  subclassLabel,
  level,
  xpCurrent,
  xpNextThreshold,
}: SheetHeroProps) {
  const initials = getInitials(name);
  const isMaxLevel = level >= 20;
  const xpFill = isMaxLevel
    ? 100
    : Math.min(100, Math.round((xpCurrent / xpNextThreshold) * 100));

  const subtitle = [raceLabel, classLabel].filter(Boolean).join(' · ') || null;

  return (
    <div
      className="relative overflow-hidden rounded-md px-4 py-5"
      style={{
        background:
          'linear-gradient(135deg, #2A2240 0%, #1B1428 100%)',
      }}
    >
      {/* Subtle aurora overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 80% 20%, rgba(111,134,201,0.18), transparent 55%)',
        }}
      />

      <div className="relative z-10 flex items-center gap-4">
        {/* Portrait — conic ring + initials */}
        <div
          className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-md"
          style={{
            background:
              'conic-gradient(from 180deg, #E8946F 0%, #6F86C9 40%, #B6829F 70%, #E8946F 100%)',
            padding: '2px',
          }}
          aria-label={`Iniciales de ${name}`}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-sm"
            style={{ background: 'linear-gradient(135deg, #2A2240, #1B1428)' }}
          >
            <span className="font-display text-2xl font-bold text-white">
              {initials}
            </span>
          </div>
        </div>

        {/* Name + subtitle + pills */}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold leading-tight text-white truncate">
            {name}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm italic text-white/60 truncate">{subtitle}</p>
          )}

          {/* Pills row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* Level */}
            <span className="inline-flex items-center rounded-pill border border-white/40 px-2.5 py-0.5 text-xs font-semibold text-white/90">
              ✦ Nivel {level}
            </span>

            {/* Class */}
            {classLabel && (
              <span className="inline-flex items-center rounded-pill bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
                {classLabel}
              </span>
            )}

            {/* Subclass */}
            {subclassLabel && (
              <span className="inline-flex items-center rounded-pill border border-white/30 px-2.5 py-0.5 text-xs font-medium text-white/70">
                {subclassLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div className="relative z-10 mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/50">
            Experiencia
          </span>
          <span className="text-[10px] font-semibold text-white/70">
            {isMaxLevel ? 'MAX' : `${xpCurrent.toLocaleString()} / ${xpNextThreshold.toLocaleString()}`}
          </span>
        </div>
        {!isMaxLevel && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${xpFill}%`,
                background: 'linear-gradient(to right, #6F86C9, #4C63A6)',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
