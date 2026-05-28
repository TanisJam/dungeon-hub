import { Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import type { CategoryId } from './types';
import { V3_COMPENDIUM_CATS } from './data';

interface CompendiumCategoryGridProps {
  counts: Record<CategoryId, number | '—' | '∞'>;
}

export function CompendiumCategoryGrid({ counts }: CompendiumCategoryGridProps) {
  return (
    <div className="compendium-init-cat-grid">
      {V3_COMPENDIUM_CATS.map((cat) => {
        const raw = counts[cat.id];
        const display = `${raw} entradas`;
        return (
          <button
            key={cat.id}
            type="button"
            className={`compendium-init-cat-card${cat.cls ? ` ${cat.cls}` : ''}`}
          >
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
