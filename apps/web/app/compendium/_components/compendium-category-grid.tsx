import Link from 'next/link';
import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { CategoryId } from './types';
import { V3_COMPENDIUM_CATS } from './data';

// Biblioteca categories — all have API endpoints (REQ-CBROWSE-01).
// codex-ia-reframe W1: items/monsters/lore are no longer library cards (see data.ts).
const BROWSABLE_CATEGORIES = new Set<CategoryId>(['spells', 'races', 'classes', 'backgrounds', 'feats', 'conditions']);

interface CompendiumCategoryGridProps {
  counts: Record<CategoryId, number | '—' | '∞'>;
  /** Active campaign UUID for category hrefs. Null → cards render without hrefs. REQ-CBROWSE-01. */
  campaignId: string | null;
}

/**
 * CompendiumCategoryGrid — Biblioteca grid (6 library categories).
 * Browsable categories → Link to /compendium/[cat]?campaign=[id].
 * If campaignId is null → cards render as buttons with no navigation + banner.
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

        // No campaign → non-navigating button (banner explains why).
        return (
          <button key={cat.id} type="button" className={cardClass}>
            <div className="ic">
              <Icon name={cat.icon as IconName} size={18} />
            </div>
            <div className="ttl">{cat.name}</div>
            <div className="ct">{display}</div>
          </button>
        );
      })}
    </div>
  );
}
