/**
 * BookDetailBody — server component (RSC).
 *
 * Renders book item: bookpage card with passage + ❦ ornaments + reading progress +
 * optional knowledge section + disabled "Leer" CTA stub.
 *
 * All CTAs are disabled stubs (DC6 — RSC event-handler rule; no onClick).
 * pagesRead is read-only (DC3 — no persistence yet; reading progress is client-stubbed).
 *
 * Reqs: WIBD-BODY-01 (spec #1077)
 * Design: DCE1 (RSC), DC3 (no decrement persistence), DC6 (stub CTA)
 *
 * House rule (PHB p.114): "Leer durante descanso largo" — PHB only specifies
 * spellbooks; generic tome reading rule is a house rule per CLAUDE.md §10.
 *
 * CSS: ❦ ornaments rendered via .inventory-init-detail-bookpage::before/::after (globals.css).
 * --font-script (L63): var(--font-mplus-rounded) for passage text.
 */
import type { BookDetailVariant } from '@/lib/sheet-types';

interface BookDetailBodyProps {
  detail: BookDetailVariant;
}

export function BookDetailBody({ detail }: BookDetailBodyProps) {
  const progressPct = detail.pages > 0
    ? Math.round((detail.pagesRead / detail.pages) * 100)
    : 0;

  return (
    <div>
      {/* Bookpage card — ❦ ornaments via CSS ::before/::after */}
      <div className="inventory-init-detail-bookpage" style={{ marginTop: '10px' }}>
        <p className="passage">{detail.passage}</p>

        {/* Reading progress bar (DC3 — read-only display, no decrement) */}
        <div className="progress">
          <span className="lbl">Leído</span>
          <div className="bar">
            <div
              className="fill"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={detail.pagesRead}
              aria-valuemin={0}
              aria-valuemax={detail.pages}
            />
          </div>
          <span className="lbl">{detail.pagesRead} / {detail.pages}</span>
        </div>
      </div>

      {/* Facts: Idioma + Páginas */}
      <div className="inventory-init-detail-facts two" style={{ marginTop: '8px' }}>
        <div className="fact">
          <div className="k">Idioma</div>
          <div className="v small">{detail.language}</div>
        </div>
        <div className="fact">
          <div className="k">Páginas</div>
          <div className="v small">{detail.pages}</div>
        </div>
      </div>

      {/* Conocimiento desbloqueado — only shown when knowledge entries exist */}
      {detail.knowledge.length > 0 && (
        <div className="inventory-init-detail-facts full" style={{ marginTop: '8px' }}>
          <div className="fact">
            <div className="k">Conocimiento desbloqueado</div>
            <div className="v small">{detail.knowledge.join(' · ')}</div>
          </div>
        </div>
      )}

      {/* DC6 + DC3: Disabled CTA stub — no onClick, no persistence (house rule PHB p.114) */}
      <div className="inventory-init-detail-actions" style={{ marginTop: '14px' }}>
        <button
          disabled
          className="inventory-init-detail-use-big"
          data-stub="true"
          aria-label="Leer (durante descanso largo)"
        >
          Leer
        </button>
      </div>
    </div>
  );
}
