/**
 * WeaponDetailBody — server component.
 *
 * Renders weapon stats: attack CTA + facts grid (Daño/Tipo/Alcance) + properties.
 *
 * Reqs: WIWD-BODY-01 (spec #1070)
 * Design: DBE3 — RSC body; DBE4 — RollAttackStubButton is 'use client' child.
 *
 * PHB p.149 — Weapons table; PHB p.194 — attack roll formula.
 */
import type { WeaponDetailVariant } from '@/lib/sheet-types';
import { RollAttackStubButton } from './roll-attack-stub-button';

interface WeaponDetailBodyProps {
  detail: WeaponDetailVariant;
}

export function WeaponDetailBody({ detail }: WeaponDetailBodyProps) {
  return (
    <div>
      {/* PHB p.194: attack bonus CTA */}
      <RollAttackStubButton bonus={detail.attackBonus} />

      {/* PHB p.149: Daño / Tipo / Alcance */}
      <div className="inventory-init-detail-facts three" style={{ marginTop: '10px' }}>
        <div className="fact">
          <div className="k">Daño</div>
          <div className="v mono">{detail.dmg1 ?? '—'}</div>
        </div>
        <div className="fact">
          <div className="k">Tipo</div>
          <div className="v small">{detail.dmgType ?? '—'}</div>
        </div>
        <div className="fact">
          <div className="k">Alcance</div>
          <div className="v small">{detail.range ? `${detail.range} ft` : '—'}</div>
        </div>
      </div>

      {detail.properties.length > 0 && (
        <div className="inventory-init-detail-facts full" style={{ marginTop: '8px' }}>
          <div className="fact">
            <div className="k">Propiedades</div>
            <div className="v small">{detail.properties.join(' · ')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
