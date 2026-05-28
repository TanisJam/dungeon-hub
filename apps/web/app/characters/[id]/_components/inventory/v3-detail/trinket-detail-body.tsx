/**
 * TrinketDetailBody — server component (RSC).
 *
 * Renders trinket flavor: "Sin reglas mecánicas" header + narrative text + ghost action strip.
 * All CTAs are disabled stubs (DC6 — RSC event-handler rule; no onClick).
 *
 * Reqs: WITD-BODY-01 (spec #1077)
 * Design: DCE1 (RSC body), DC6 (stub CTAs)
 *
 * PHB p.161: Trinkets table — no mechanical effect; exist for narrative.
 */
import type { TrinketDetailVariant } from '@/lib/sheet-types';

interface TrinketDetailBodyProps {
  detail: TrinketDetailVariant;
}

/** PHB p.161: trinkets have no mechanical effect. */
const FALLBACK_NARRATIVE =
  'Esta baratija no tiene efecto mecánico. Existe para tu narración.';

export function TrinketDetailBody({ detail }: TrinketDetailBodyProps) {
  return (
    <div>
      {/* PHB p.161: no mechanical rules section */}
      <div className="inventory-init-detail-facts full" style={{ marginTop: '10px' }}>
        <div className="fact">
          <div className="k">Sin reglas mecánicas</div>
          <div className="v small">
            {detail.narrative ?? FALLBACK_NARRATIVE}
          </div>
        </div>
      </div>

      {/* DC6: Disabled ghost CTA stubs — no onClick (RSC event-handler rule) */}
      <div className="inventory-init-detail-actions" style={{ marginTop: '14px' }}>
        <button disabled className="btn-ghost" aria-label="Regalar">
          Regalar
        </button>
        <button disabled className="btn-ghost" aria-label="Anotar memoria">
          Anotar memoria
        </button>
        <button disabled className="btn-ghost" aria-label="Mostrar al grupo">
          Mostrar al grupo
        </button>
      </div>
    </div>
  );
}
