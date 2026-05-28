/**
 * InventoryDetailHero — server component.
 *
 * Renders the hero block: 72×72 glyph + name + subtitle + rarity stamp +
 * meta-pills row + equip chip. Per-type tint class applied via v3Type.
 *
 * Reqs: WIDS-SHELL-01, WIE10-MIGRATE-01 (spec #1070)
 * Design: DBE4 — EquipChip is 'use client'; this component is RSC.
 */
import type { InventoryDetailResponse } from '@/lib/sheet-types';
import { EquipChip } from './equip-chip';

const TYPE_GLYPHS: Record<string, string> = {
  weapon: '⚔️',
  armor: '🛡️',
  consumable: '⚗️',
  food: '🍖',
  magic: '✨',
  trinket: '🔮',
  book: '📖',
  quest: '📜',
  incomplete: '❓',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Común',
  uncommon: 'Poco común',
  rare: 'Raro',
  'very-rare': 'Muy raro',
  legendary: 'Legendario',
  artifact: 'Artefacto',
};

interface InventoryDetailHeroProps {
  detail: InventoryDetailResponse;
  characterId: string;
}

export function InventoryDetailHero({ detail, characterId }: InventoryDetailHeroProps) {
  const glyph = TYPE_GLYPHS[detail.v3Type] ?? '📦';

  return (
    <div className={`inventory-init-detail-hero ${detail.v3Type}`}>
      {detail.rarity && (
        <span className={`rarity-stamp rarity-${detail.rarity}`}>
          {RARITY_LABELS[detail.rarity] ?? detail.rarity}
        </span>
      )}

      <div className="glyph" aria-hidden="true">
        {glyph}
      </div>

      <div className="id">
        <p className="nm" id={`detail-name-${detail.instanceId}`}>
          {detail.displayName}
        </p>
        {detail.subtitle && (
          <p className="sub">{detail.subtitle}</p>
        )}

        <div className="inventory-init-detail-meta-row">
          {detail.weightLb != null && (
            <span className="inventory-init-detail-facts" style={{ fontSize: '10px', color: 'var(--color-ink-mute)' }}>
              {detail.weightLb} lb
            </span>
          )}
          {detail.qty > 1 && (
            <span style={{ fontSize: '10px', color: 'var(--color-ink-mute)' }}>
              ×{detail.qty}
            </span>
          )}

          <EquipChip
            characterId={characterId}
            instanceId={detail.instanceId}
            equipped={detail.equipped}
          />
        </div>
      </div>
    </div>
  );
}
