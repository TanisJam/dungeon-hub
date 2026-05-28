/**
 * ArmorDetailBody — server component.
 *
 * Renders armor stats: CA base / Tipo / Sigilo / Vestir + STR rule.
 *
 * Reqs: WIAD-BODY-01 (spec #1070)
 * Design: DBE3 — RSC body (display only, no local state needed).
 *
 * PHB p.144-145 — Armor table.
 */
import type { ArmorDetailVariant } from '@/lib/sheet-types';

interface ArmorDetailBodyProps {
  detail: ArmorDetailVariant;
}

const ARMOR_CATEGORY_LABELS: Record<string, string> = {
  LA: 'Ligera',
  MA: 'Media',
  HA: 'Pesada',
  S: 'Escudo',
};

export function ArmorDetailBody({ detail }: ArmorDetailBodyProps) {
  const categoryLabel =
    detail.armorCategory != null
      ? (ARMOR_CATEGORY_LABELS[detail.armorCategory] ?? detail.armorCategory)
      : '—';

  const stealthLabel = detail.stealth ? 'Desventaja' : 'Normal';

  return (
    <div>
      {/* PHB p.144-145: CA base / Tipo / Sigilo / Vestir */}
      <div className="inventory-init-detail-facts two" style={{ marginTop: '10px' }}>
        <div className="fact">
          <div className="k">CA base</div>
          <div className="v mono">
            {detail.acBase ?? '—'}
            {detail.dexCapNote && (
              <span style={{ fontSize: '10px', color: 'var(--color-ink-mute)', display: 'block' }}>
                {detail.dexCapNote}
              </span>
            )}
          </div>
        </div>
        <div className="fact">
          <div className="k">Tipo</div>
          <div className="v small">{categoryLabel}</div>
        </div>
        <div className="fact">
          <div className="k">Sigilo</div>
          <div className="v small">{stealthLabel}</div>
        </div>
        <div className="fact">
          <div className="k">Vestir</div>
          <div className="v small">{detail.donTime}</div>
        </div>
      </div>

      {/* PHB p.144: STR minimum requirement */}
      {detail.armorStrengthMin > 0 && (
        <div className="inventory-init-detail-rule" style={{ marginTop: '8px' }}>
          <span className="k">FUE requerida</span>
          <span className="v">{detail.armorStrengthMin}</span>
        </div>
      )}
    </div>
  );
}
