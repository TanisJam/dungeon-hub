/**
 * WeightBar — horizontal gradient bar showing current / max carry weight.
 *
 * Server Component (pure render — no client state).
 * Reqs: WIVLS-WEIGHT-01 (spec #1063)
 * PHB p.176 — Lifting and Carrying: carry capacity = STR × 15 lbs.
 *
 * Gradient: --color-success → --color-accent (DA6 — existing tokens).
 */
import type { EncumbranceView } from '@/lib/sheet-types';

interface WeightBarProps {
  encumbrance: EncumbranceView;
}

export function WeightBar({ encumbrance }: WeightBarProps) {
  const { weight, max } = encumbrance;
  const pct = max > 0 ? Math.min(100, Math.round((weight / max) * 100)) : 0;

  return (
    <div
      className="inventory-init-weight"
      role="progressbar"
      aria-label="Capacidad de carga"
      aria-valuenow={weight}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span className="lbl">Peso</span>
      <span className="v">{weight}</span>
      <span className="vmax">/ {max} lb</span>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
