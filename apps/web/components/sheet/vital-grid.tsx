import type { ReactNode } from 'react';
import { StatCell } from '@/components/ui/stat-cell';
import { ProgressBar } from '@/components/ui/progress-bar';

interface VitalGridProps {
  hp: { current: number | null; max: number | null; temp?: number };
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

  const hpBar =
    hp.max !== null && hp.max > 0 ? (
      <ProgressBar
        value={effectiveCurrent ?? 0}
        max={hp.max}
        tone="accent"
        height="sm"
        trackClassName="bg-accent/20"
        className="mt-2"
        ariaLabel="Puntos de vida"
      />
    ) : null;

  const hpTempEl =
    hp.temp !== undefined && hp.temp > 0 ? (
      <span className="text-[10px] font-bold text-amber-400 leading-tight" data-testid="hp-temp">
        +{hp.temp} temporal
      </span>
    ) : null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* HP — peach gradient (ficha-vital-hp replaces inline style) */}
      <StatCell
        label="Puntos de Golpe"
        value={hpDisplay}
        size="compact"
        accent="peach"
        footer={
          <>
            {hpTempEl}
            {hpBar}
            {hpEditorSlot}
          </>
        }
      />

      {/* AC — ficha-vital-ac adds cyan glow ring */}
      <StatCell
        label="Clase Armadura"
        value={dash(ac)}
        accent="teal"
        sub={armorFormula}
      />

      {/* Initiative — ficha-vital-init adds copper glow ring */}
      <StatCell
        label="Iniciativa"
        value={formatInitiative(initiative)}
        accent="magenta"
        sub={walkSpeed !== undefined ? `${walkSpeed} ft vel.` : undefined}
      />
    </div>
  );
}
