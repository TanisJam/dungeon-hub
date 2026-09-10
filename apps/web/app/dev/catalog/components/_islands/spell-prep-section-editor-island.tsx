'use client';

// NOTE: mirrors SpellPrepSectionEditor (apps/web/components/ficha/spells/spell-prep-section-editor.tsx)
// Dev-only catalog island — pencil button + V3Sheet + SpellPrepEditorIsland.
// REAL component does a lazy API fetch (GET /options) when the sheet opens;
// this island bypasses the fetch and injects fixture data directly.
// PAIR ANALYSIS: SpellPrepSectionEditor vs SpellKnownSectionEditor:
//   - SAME structural pattern: pencil/wand button + lazy fetch + V3Sheet wrapper
//   - DIFFERENCE: SpellPrepSectionEditor uses pencil icon (edit) + border-line styling;
//     SpellKnownSectionEditor uses wand icon + amber styling (DM visual signal)
//   - DIFFERENCE: SpellPrepSectionEditor has classSource hardcoded as 'PHB' in render
//   - SAME fetch URL: GET /characters/:id/classes/:slug/spells/options (SAME ENDPOINT!)
//   → Both section editors share the SAME lazy-fetch pattern and SAME API endpoint.
//   → HIGH-ROI homogenization candidate: a shared useSpellOptions(characterId, classSlug)
//     hook would eliminate the duplicated useEffect + FetchState in both section editors.

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { SpellPrepEditorIsland } from './spell-prep-editor-island';

const FIXTURE_SPELLS = [
  { slug: 'cure-wounds', source: 'PHB', name: 'Cure Wounds', level: 1 },
  { slug: 'bless', source: 'PHB', name: 'Bless', level: 1 },
  { slug: 'guiding-bolt', source: 'PHB', name: 'Guiding Bolt', level: 1 },
  { slug: 'hold-person', source: 'PHB', name: 'Hold Person', level: 2 },
  { slug: 'spiritual-weapon', source: 'PHB', name: 'Spiritual Weapon', level: 2 },
  { slug: 'dispel-magic', source: 'PHB', name: 'Dispel Magic', level: 3 },
];

// Cleric 5 domain spells (Life domain) always prepared
const FIXTURE_GRANTED = ['cure-wounds', 'bless'];

interface Props {
  classSlug: string;
  initialPreparedSlugs?: string[];
  prepLimit?: number;
}

export function SpellPrepSectionEditorIsland({
  classSlug,
  initialPreparedSlugs = ['guiding-bolt'],
  prepLimit = 8,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Transparent 44px tap target around the 32px icon square — see the
          real SpellPrepSectionEditor for why. */}
      <button
        type="button"
        aria-label={`Preparar hechizos – ${classSlug}`}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center bg-transparent p-0"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-mute transition-colors hover:border-accent hover:text-accent">
          <Icon name="edit" size={14} />
        </span>
      </button>

      <V3Sheet open={open} onClose={() => setOpen(false)} title="Preparar hechizos">
        {/* Catalog bypasses real fetch — fixtures injected directly */}
        <SpellPrepEditorIsland
          availableSpells={FIXTURE_SPELLS}
          subclassGrantedSlugs={FIXTURE_GRANTED}
          initialPreparedSlugs={initialPreparedSlugs}
          prepLimit={prepLimit}
        />
      </V3Sheet>
    </>
  );
}
