'use client';

// NOTE: mirrors SpellKnownSectionEditor (apps/web/components/ficha/spells/spell-known-section-editor.tsx)
// Dev-only catalog island — amber wand button + V3Sheet + SpellKnownEditorIsland.
// REAL component does a lazy API fetch (GET /options) when the sheet opens;
// this island bypasses the fetch and injects fixture spell data directly.
// PAIR ANALYSIS: SpellKnownSectionEditor is MORE THAN a thin wrapper — it adds:
//   (1) amber wand Icon button (visually distinct from pencil — DM affordance signal)
//   (2) lazy useEffect fetch for availableSpells (loading/error/loaded states)
//   (3) V3Sheet host titled "Asignar hechizos conocidos (DM)"
// SpellKnownEditor owns the checkbox form logic.
// → The fetch adds meaningful complexity; NOT pure duplication vs AtributosSectionEditor.

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { V3Sheet } from '@/components/ui/sheet';
import { SpellKnownEditorIsland } from './spell-known-editor-island';

const FIXTURE_SPELLS = [
  { slug: 'magic-missile', name: 'Magic Missile', level: 1 },
  { slug: 'shield', name: 'Shield', level: 1 },
  { slug: 'thunderwave', name: 'Thunderwave', level: 1 },
  { slug: 'misty-step', name: 'Misty Step', level: 2 },
  { slug: 'mirror-image', name: 'Mirror Image', level: 2 },
  { slug: 'fireball', name: 'Fireball', level: 3 },
  { slug: 'counterspell', name: 'Counterspell', level: 3 },
];

interface Props {
  classSlug: string;
  currentKnownSlugs?: string[];
}

export function SpellKnownSectionEditorIsland({
  classSlug,
  currentKnownSlugs = ['magic-missile', 'shield'],
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Transparent 44px tap target around the 32px icon square — see the
          real SpellKnownSectionEditor for why. */}
      <button
        type="button"
        aria-label={`Asignar hechizos conocidos – ${classSlug}`}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center bg-transparent p-0"
        title="DM: asignar hechizos conocidos"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/40 text-amber-400 transition-colors hover:border-amber-400 hover:bg-amber-500/10">
          <Icon name="wand" size={14} />
        </span>
      </button>

      <V3Sheet open={open} onClose={() => setOpen(false)} title="Asignar hechizos conocidos (DM)">
        {/* Catalog bypasses real fetch — fixtures injected directly */}
        <SpellKnownEditorIsland
          availableSpells={FIXTURE_SPELLS}
          currentKnownSlugs={currentKnownSlugs}
        />
      </V3Sheet>
    </>
  );
}
