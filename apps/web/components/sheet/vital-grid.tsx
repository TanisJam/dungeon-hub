import type { ReactNode } from 'react';

interface VitalGridProps {
  hp: { current: number | null; max: number | null };
  ac: number | null;
  initiative: number | null;
  armorFormula?: string;
  walkSpeed?: number;
  /**
   * Optional slot rendered inside the HP cell (absolute top-1 right-1).
   * Used by character sheet page to inject the role-reactive HPSectionEditor
   * via DmAwareAffordances (FIX B). When absent, no editor affordance is shown.
   */
  hpEditorSlot?: ReactNode;
}

function dash(value: number | null): string {
  return value === null ? '—' : String(value);
}

function formatInitiative(value: number | null): string {
  if (value === null) return '—';
  return value >= 0 ? `+${value}` : String(value);
}

export function VitalGrid({
  hp,
  ac,
  initiative,
  armorFormula,
  walkSpeed,
  hpEditorSlot,
}: VitalGridProps) {
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
      {/* HP — peach gradient (ficha-vital-hp replaces inline style) */}
      <div className="ficha-vital-hp flex flex-col items-center rounded-md px-3 py-4 text-center relative">
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
        {/* HP editor slot — injected by parent (DmAwareAffordances for character sheet).
            Uses absolute positioning inside this relative container. */}
        {hpEditorSlot}
      </div>

      {/* AC — ficha-vital-ac adds cyan glow ring */}
      <div className="ficha-vital-ac flex flex-col items-center rounded-md bg-surface border border-line px-3 py-4 text-center">
        <span className="text-[9px] font-bold uppercase tracking-widest text-ink-mute">
          Clase Armadura
        </span>
        <span className="font-display text-2xl font-bold text-ink leading-tight mt-0.5">
          {dash(ac)}
        </span>
        {armorFormula && (
          <span className="mt-1 text-[9px] text-ink-mute leading-tight break-words w-full">
            {armorFormula}
          </span>
        )}
      </div>

      {/* Initiative — ficha-vital-init adds copper glow ring */}
      <div className="ficha-vital-init flex flex-col items-center rounded-md bg-surface border border-line px-3 py-4 text-center">
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
