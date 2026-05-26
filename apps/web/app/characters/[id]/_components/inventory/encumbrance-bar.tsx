/**
 * Encumbrance bar — Server Component.
 *
 * REQ-INV-ENCUMBRANCE-DISPLAY (spec #843 — inventory-foundation). Renders a
 * weight/capacity bar with PHB p.176 variant thresholds:
 *   0    – STR×5  → 'ok'        (green)
 *   STR×5  – STR×10 → 'encumbered' (yellow, speed -10)
 *   STR×10 – STR×15 → 'heavily'    (orange, speed -20)
 *   > STR×15           → 'over'       (red, no carry)
 *
 * When the rules-variant is OFF the domain only reports 'ok' or 'over';
 * the intermediate thresholds are still rendered so the user has a sense of
 * capacity headroom, but no warning banner is emitted unless status warrants.
 */
import type { EncumbranceStatus, EncumbranceView } from '@/lib/sheet-types';

interface EncumbranceBarProps {
  encumbrance: EncumbranceView;
}

const STATUS_COPY: Record<EncumbranceStatus, string> = {
  ok: 'Sin sobrecarga',
  encumbered: 'Sobrecargado (-10 ft de velocidad).',
  'heavily-encumbered': 'Muy sobrecargado (-20 ft de velocidad, desventaja en chequeos de FUE/DES/CON).',
  over: 'Capacidad máxima superada: no podés cargar más.',
};

const BAR_COLOR: Record<EncumbranceStatus, string> = {
  ok: 'bg-emerald-500',
  encumbered: 'bg-amber-400',
  'heavily-encumbered': 'bg-orange-500',
  over: 'bg-red-600',
};

const BANNER_COLOR: Record<Exclude<EncumbranceStatus, 'ok'>, string> = {
  encumbered: 'border-amber-300 bg-amber-50 text-amber-800',
  'heavily-encumbered': 'border-orange-300 bg-orange-50 text-orange-800',
  over: 'border-red-300 bg-red-50 text-red-800',
};

export function EncumbranceBar({ encumbrance }: EncumbranceBarProps) {
  const { weight, max, status, thresholds, coinWeight } = encumbrance;
  // % fill capped at 100. We render against the absolute ceiling STR×15.
  const pct = max > 0 ? Math.min(100, Math.round((weight / max) * 100)) : 0;

  return (
    <div className="space-y-2" aria-label="Capacidad de carga">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-ink-mute">
          Carga
        </p>
        <div className="text-right">
          <p className="text-xs font-semibold text-ink-soft tabular-nums">
            {weight} / {max} lb
          </p>
          {/* REQ-ID-ENCUMBRANCE-COIN-LABEL: show coin weight hint when > 0. */}
          {coinWeight != null && coinWeight > 0 && (
            <p className="text-[10px] text-ink-mute tabular-nums">
              Monedas: {coinWeight} lb
            </p>
          )}
        </div>
      </div>

      {/* Capacity track with threshold ticks */}
      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-paper-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(weight, max)}
      >
        <div
          className={`h-full rounded-full transition-[width] ${BAR_COLOR[status]}`}
          style={{ width: `${pct}%` }}
        />
        {/* Ticks at STR×5 (encumbered) and STR×10 (heavily). Only render when
            in-range and the threshold is between 0 and max. */}
        {thresholds.encumbered > 0 && thresholds.encumbered < max && (
          <span
            aria-hidden
            className="absolute top-0 h-full w-px bg-ink/20"
            style={{ left: `${(thresholds.encumbered / max) * 100}%` }}
          />
        )}
        {thresholds.heavily > 0 && thresholds.heavily < max && (
          <span
            aria-hidden
            className="absolute top-0 h-full w-px bg-ink/30"
            style={{ left: `${(thresholds.heavily / max) * 100}%` }}
          />
        )}
      </div>

      {status !== 'ok' && (
        <div
          role="status"
          className={`rounded-md border px-3 py-2 text-xs font-medium ${BANNER_COLOR[status]}`}
        >
          {STATUS_COPY[status]}
        </div>
      )}
    </div>
  );
}
