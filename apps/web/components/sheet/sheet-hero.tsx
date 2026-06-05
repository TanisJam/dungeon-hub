import { Pill } from '@/components/ui/pill';
import { CharacterPortrait } from '@/components/ui/character-portrait';

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

export function SheetHero({
  name,
  raceLabel,
  classLabel,
  subclassLabel,
  level,
  xpCurrent,
  xpNextThreshold,
}: SheetHeroProps) {
  const isMaxLevel = level >= 20;
  const xpFill = isMaxLevel
    ? 100
    : Math.min(100, Math.round((xpCurrent / xpNextThreshold) * 100));

  const subtitle = [raceLabel, classLabel].filter(Boolean).join(' · ') || null;

  return (
    <div
      className="ficha-hero-bg relative overflow-hidden rounded-md px-4 py-5"
    >
      {/* Subtle aurora overlay — included in ficha-hero-bg radial layer */}
      <div className="pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex items-center gap-4">
        {/* Portrait — conic ring + initials (CharacterPortrait hero variant) */}
        <CharacterPortrait name={name} size="hero" ariaLabel={`Iniciales de ${name}`} />

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
            {/* Level — NORM: font-semibold→font-medium (atom base) */}
            <Pill tone="neutral" fill="outline" size="md">✦ Nivel {level}</Pill>

            {/* Class — FLAG: text-white→text-on-accent (dark ink on copper). Human sign-off needed. */}
            {classLabel && (
              <Pill tone="accent" fill="solid" size="md">{classLabel}</Pill>
            )}

            {/* Subclass — NORM: border-white/30→/40, text-white/70→/90 (atom outline neutral) */}
            {subclassLabel && (
              <Pill tone="neutral" fill="outline" size="md">{subclassLabel}</Pill>
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
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-arcane to-arcane-deep"
              style={{ width: `${xpFill}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
