import { SectionHead } from '@/components/ui';
import { CompendiumCategoryGrid } from './compendium-category-grid';
import { CompendiumCuratedRow } from './compendium-curated-row';
import { CompendiumDemoIsland } from './compendium-demo-island';
import type { CategoryId } from './types';

interface CompendiumScreenProps {
  counts: Record<CategoryId, number | '—' | '∞'>;
}

/**
 * CompendiumScreen — server shell for the /compendium route.
 * WCS-SCOPE-01: outer .compendium-init wrapper.
 * Composes: search trigger + sheet (via island), category grid, curated row, recents list.
 */
export function CompendiumScreen({ counts }: CompendiumScreenProps) {
  return (
    <div className="compendium-init">
      {/* Client island: search trigger + recents list + spell detail sheet */}
      <CompendiumDemoIsland />

      {/* Category grid — server rendered */}
      <div>
        <SectionHead title="Categorías" />
        <div className="mt-3">
          <CompendiumCategoryGrid counts={counts} />
        </div>
      </div>

      {/* Curated campaign row — server rendered static stub */}
      <div>
        <SectionHead title="Tu campaña" meta="curado por el DM" />
        <div className="mt-3">
          <CompendiumCuratedRow />
        </div>
      </div>

      {/* Más consultado is rendered inside the island so Fireball row can open the sheet */}
      <div>
        <SectionHead title="Más consultado" />
      </div>
    </div>
  );
}
