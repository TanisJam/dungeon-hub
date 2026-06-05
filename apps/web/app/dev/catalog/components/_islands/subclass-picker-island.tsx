'use client';

/**
 * SubclassPickerIsland — catalog demo of the shared SubclassPicker component.
 *
 * SubclassPicker is a pure presentational component that receives options + onSelect
 * via props. This island supplies PHB Wizard subclass fixtures and manages selectedKey
 * via local state — no server action, no router.
 *
 * Two variants shown:
 *   - Populated: 4 Wizard subclasses (PHB p.112) with toggle selection.
 *   - Empty: no options → warning fallback state.
 *
 * INTERACTIVE — tap a card to select/deselect it.
 */

import { useState } from 'react';
import { SubclassPicker } from '@/components/character/subclass-picker';

// PHB 2014 p.112 — Arcane Traditions (Wizard subclasses)
const WIZARD_SUBCLASSES = [
  { id: 'sc-abjuration',   slug: 'school-of-abjuration',   source: 'PHB', name: 'School of Abjuration',   classSlug: 'wizard', classSource: 'PHB' },
  { id: 'sc-conjuration',  slug: 'school-of-conjuration',  source: 'PHB', name: 'School of Conjuration',  classSlug: 'wizard', classSource: 'PHB' },
  { id: 'sc-divination',   slug: 'school-of-divination',   source: 'PHB', name: 'School of Divination',   classSlug: 'wizard', classSource: 'PHB' },
  { id: 'sc-evocation',    slug: 'school-of-evocation',    source: 'PHB', name: 'School of Evocation',    classSlug: 'wizard', classSource: 'PHB' },
];

export function SubclassPickerIsland() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  return (
    <SubclassPicker
      title="Arcane Tradition"
      options={WIZARD_SUBCLASSES}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
    />
  );
}

export function SubclassPickerEmptyIsland() {
  return (
    <SubclassPicker
      title="Subclass"
      options={[]}
      selectedKey={null}
      onSelect={() => {/* no options — empty state */}}
    />
  );
}
