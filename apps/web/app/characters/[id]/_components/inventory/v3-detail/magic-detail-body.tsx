/**
 * MagicDetailBody — server component (RSC).
 *
 * Renders magic item details: attunement pip strip + power description + charges counter.
 * All CTAs are disabled stubs (DC6 — RSC event-handler rule; no onClick).
 *
 * Reqs: WIMD-BODY-01 (spec #1077)
 * Design: DCE1 (all 4 advanced bodies are RSC), DC2 (no compute fn — pip strip is
 *         display-only derived from reqAttune+attuned per-instance), DC6 (stub CTAs)
 *
 * PHB p.136-138: Magic Items — Attunement.
 * PHB p.138: "You can attune to it over a short rest." (restAttuneNote fixed copy)
 */
import type { MagicDetailVariant } from '@/lib/sheet-types';

interface MagicDetailBodyProps {
  detail: MagicDetailVariant;
}

export function MagicDetailBody({ detail }: MagicDetailBodyProps) {
  return (
    <div>
      {/* PHB p.138: Attunement pip strip — only when reqAttune is set */}
      {detail.attuneRequired && (
        <div className="inventory-init-detail-attune" style={{ marginTop: '10px' }}>
          {detail.attuned ? (
            <>
              <span className="pip" aria-hidden="true" />
              <span className="lbl">Sintonizado</span>
            </>
          ) : (
            <>
              <span className="lbl">Requiere sintonización</span>
              <span className="meta">{detail.restAttuneNote}</span>
            </>
          )}
        </div>
      )}

      {/* Power description (from entriesSummary). Collapsed when powerDesc is null (R7). */}
      {detail.powerDesc && (
        <div className="inventory-init-detail-facts full" style={{ marginTop: '10px' }}>
          <div className="fact">
            <div className="v small">{detail.powerDesc}</div>
          </div>
        </div>
      )}

      {/* Charges counter — only when chargesMax is defined */}
      {detail.chargesMax != null && (
        <div className="inventory-init-detail-counter" style={{ marginTop: '10px' }}>
          <span className="v">{detail.chargesMax}</span>
          <span className="lbl">Cargas máx.</span>
          {detail.charges != null && (
            <span className="meta">{detail.charges} restantes</span>
          )}
        </div>
      )}

      {/* DC6: Disabled CTA stub — no onClick (RSC event-handler rule) */}
      <div className="inventory-init-detail-actions" style={{ marginTop: '14px' }}>
        <button
          disabled
          className="inventory-init-detail-use-big secondary"
          data-stub="true"
          aria-label="Activar poder"
        >
          Activar poder
        </button>
      </div>
    </div>
  );
}
