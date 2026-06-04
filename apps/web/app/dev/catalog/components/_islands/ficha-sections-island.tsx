'use client';

// NOTE: thin wrapper islands for BackgroundSection, ClassSection, RaceSection.
// These components are 'use client' and manage open/close state internally.
// They can render directly in the catalog with fixture props — no server actions needed.
// All three follow the SAME structural pattern (pencil button + ViewOnlySectionSheet).
// PAIR ANALYSIS (section components): BackgroundSection, ClassSection, RaceSection are
// NOT pairs with each other — they are TRIPLICATE COPIES of the same pattern:
//   - pencil Icon button (h-8 w-8, border-line, hover:accent) — IDENTICAL in all 3
//   - ViewOnlySectionSheet (controlled externally via open/onClose) — SAME component
//   - Only difference: the display JSX inside ViewOnlySectionSheet is specific per section
// → HIGH-ROI homogenization candidate: a generic SectionAffordance component that accepts
//   `title`, `displayContent`, `characterStatus`, `isDm`, `wizardStepHref` would eliminate
//   the 3 near-identical boilerplate files. BackgroundSection/ClassSection/RaceSection
//   would each become a one-liner that builds `displayContent` and renders <SectionAffordance>.

import { BackgroundSection } from '@/components/ficha/sections/background-section';
import { ClassSection } from '@/components/ficha/sections/class-section';
import { RaceSection } from '@/components/ficha/sections/race-section';
import type { CharacterStatus } from '@/lib/sheet-types';

interface BackgroundSectionIslandProps {
  characterStatus: CharacterStatus;
  isDm: boolean;
}

export function BackgroundSectionIsland({ characterStatus, isDm }: BackgroundSectionIslandProps) {
  return (
    <BackgroundSection
      characterId="demo-char-id"
      characterStatus={characterStatus}
      isDm={isDm}
      backgroundName="Héroe del Pueblo"
      featureName="Destino del Héroe"
      skillProficiencies={['Trato con animales', 'Supervivencia']}
    />
  );
}

interface ClassSectionIslandProps {
  characterStatus: CharacterStatus;
  isDm: boolean;
}

export function ClassSectionIsland({ characterStatus, isDm }: ClassSectionIslandProps) {
  return (
    <ClassSection
      characterId="demo-char-id"
      characterStatus={characterStatus}
      isDm={isDm}
      classes={[
        { slug: 'fighter', level: 6, subclass: { slug: 'champion' } },
      ]}
    />
  );
}

interface RaceSectionIslandProps {
  characterStatus: CharacterStatus;
  isDm: boolean;
}

export function RaceSectionIsland({ characterStatus, isDm }: RaceSectionIslandProps) {
  return (
    <RaceSection
      characterId="demo-char-id"
      characterStatus={characterStatus}
      isDm={isDm}
      raceName="Semielfo"
      subraceName="Herencia feérica"
    />
  );
}
