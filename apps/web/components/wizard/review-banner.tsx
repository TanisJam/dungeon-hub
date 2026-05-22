import { Pill } from '@/components/ui';
import type { PillTone } from '@/components/ui';

interface PillDef {
  label: string;
  tone?: PillTone;
  outline?: boolean;
}

interface ReviewBannerProps {
  name: string;
  aventureroOf?: string;
  raceClassSummary: string;
  levelPill?: PillDef;
  classPill?: PillDef;
  subclassPill?: PillDef;
}

export function ReviewBanner({
  name,
  aventureroOf,
  raceClassSummary,
  levelPill,
  classPill,
  subclassPill,
}: ReviewBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-ink to-[#1B1428] border border-line shadow-[0_12px_32px_rgba(39,30,51,0.25)] p-5 mb-4">
      {/* Stamp badge */}
      <div
        className="absolute right-4 top-1/2 -translate-y-1/2 rotate-12 flex items-center justify-center"
        aria-hidden
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-secondary text-secondary">
          <span className="text-[9px] font-bold uppercase tracking-widest leading-tight text-center">
            LISTO<br />P/APROBAR
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="pr-20 text-center">
        {aventureroOf && (
          <p className="text-[11px] italic text-paper-soft/70 mb-1">
            {aventureroOf}
          </p>
        )}
        <h2 className="font-display font-bold text-[28px] leading-tight text-paper tracking-tight">
          {name}
        </h2>
        <p className="text-sm italic text-paper-soft/60 mt-0.5">
          {raceClassSummary}
        </p>
        <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap">
          {levelPill && (
            <span className="inline-flex items-center rounded-pill border border-paper-soft/40 px-2.5 py-0.5 text-[10px] font-semibold text-paper-soft">
              {levelPill.label}
            </span>
          )}
          {classPill && (
            <Pill tone={classPill.tone ?? 'coral'} size="sm">
              {classPill.label}
            </Pill>
          )}
          {subclassPill && (
            <Pill tone={subclassPill.tone ?? 'pink'} size="sm">
              {subclassPill.label}
            </Pill>
          )}
        </div>
      </div>
    </div>
  );
}
