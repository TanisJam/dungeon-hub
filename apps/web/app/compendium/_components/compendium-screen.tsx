import { SectionHead } from '@/components/ui';
import { CompendiumCategoryGrid } from './compendium-category-grid';
import { CompendiumCuratedRow } from './compendium-curated-row';
import { CompendiumDemoIsland } from './compendium-demo-island';
import { CompendiumRecentsList } from './compendium-recents-list';
import type { CategoryId } from './types';

interface CompendiumScreenProps {
  counts: Record<CategoryId, number | '—' | '∞'>;
  /** Active campaign name from the API, or null if no active campaign. */
  campaignName: string | null;
}

/**
 * CompendiumScreen — server shell for the /compendium route.
 * WCS-SCOPE-01: outer .compendium-init wrapper.
 * Composes: search trigger (via island), category grid, curated row, recents empty state.
 */
export function CompendiumScreen({ counts, campaignName }: CompendiumScreenProps) {
  return (
    <div className="compendium-init">
      {/* Client island: search trigger */}
      <CompendiumDemoIsland />

      {/* Category grid — server rendered */}
      <div>
        <SectionHead title="Categorías" />
        <div className="mt-3">
          <CompendiumCategoryGrid counts={counts} />
        </div>
      </div>

      {/* Curated campaign row — real campaign name from API */}
      <div>
        <SectionHead title="Tu campaña" meta="curado por el DM" />
        <div className="mt-3">
          <CompendiumCuratedRow campaignName={campaignName} />
        </div>
      </div>

      {/* Más consultado — empty state (no view-history endpoint exists yet) */}
      <div>
        <SectionHead title="Más consultado" />
        <div className="mt-3">
          <CompendiumRecentsList />
        </div>
      </div>
    </div>
  );
}
