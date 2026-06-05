import Link from 'next/link';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { CategoryId } from './types';
import { V3_COMPENDIUM_CATS } from './data';

// The browser categories that have API endpoints (REQ-CBROWSE-01).
// 'lore' has no endpoint — rendered disabled with "Próximamente" affordance (ADR-7).
const BROWSABLE_CATEGORIES = new Set<CategoryId>(['spells', 'items', 'races', 'classes', 'backgrounds', 'monsters', 'feats', 'conditions']);

interface CompendiumCategoryGridProps {
  counts: Record<CategoryId, number | '—' | '∞'>;
  /** Active campaign UUID for category hrefs. Null → cards render without hrefs. REQ-CBROWSE-01. */
  campaignId: string | null;
}

/**
 * CompendiumCategoryGrid — 6-card grid. ADR-7.
 * Browsable categories → Link to /compendium/[cat]?campaign=[id].
 * 'lore' → disabled button with "Próximamente" affordance (no API endpoint).
 * If campaignId is null → all cards rendered as buttons with no navigation + banner.
 */
export function CompendiumCategoryGrid({ counts, campaignId }: CompendiumCategoryGridProps) {
  return (
    <div className="compendium-init-cat-grid">
      {V3_COMPENDIUM_CATS.map((cat) => {
        const raw = counts[cat.id];
        const display = `${raw} entradas`;
        const isBrowsable = BROWSABLE_CATEGORIES.has(cat.id);
        const cardClass = `compendium-init-cat-card${cat.cls ? ` ${cat.cls}` : ''}`;

        if (isBrowsable && campaignId) {
          const href = `/compendium/${cat.id}?campaign=${campaignId}`;
          return (
            <Link
              key={cat.id}
              href={href}
              className={cardClass}
              data-category={cat.id}
            >
              <div className="ic">
                <Icon name={cat.icon as IconName} size={18} />
              </div>
              <div className="ttl">{cat.name}</div>
              <div className="ct">{display}</div>
            </Link>
          );
        }

        // Lore (no endpoint) or no campaign → disabled button
        return (
          <button
            key={cat.id}
            type="button"
            disabled={cat.id === 'lore'}
            aria-disabled={cat.id === 'lore' ? 'true' : undefined}
            className={`${cardClass}${cat.id === 'lore' ? ' opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="ic">
              <Icon name={cat.icon as IconName} size={18} />
            </div>
            <div className="ttl">{cat.name}</div>
            <div className="ct">
              {cat.id === 'lore' ? 'Próximamente' : display}
            </div>
          </button>
        );
      })}
    </div>
  );
}
