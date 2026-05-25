/**
 * RacialTraitsBlock — Server Component.
 *
 * Renders the "Rasgos raciales" section on the character sheet Resumen tab.
 * Shows each racial trait with its name, text body, and a source badge
 * ("Linaje" for race traits, "Sublinaje" for subrace traits).
 *
 * Returns null when traits is empty — no card rendered for legacy characters.
 * Mobile-first (375px primary). No client-side interactivity needed for v1.
 *
 * 5etools {@...} tokens preserved raw — render-time parsing is a future web concern.
 *
 * PHB 2014: racial traits sourced from race/subrace entries arrays.
 * Decision #628: blocklist applied in domain (Age/Size/Speed/Languages/Darkvision/Alignment excluded).
 * Decision #630: heading "Rasgos raciales", source order preserved, tokens raw.
 * Batch 8 — race-traits-on-sheet.
 */
import { Card } from '@/components/ui';
import { Pill } from '@/components/ui';
import type { RacialTrait } from '@/lib/sheet-types';

interface RacialTraitsBlockProps {
  traits: RacialTrait[];
}

export function RacialTraitsBlock({ traits }: RacialTraitsBlockProps) {
  if (traits.length === 0) return null;

  return (
    <Card variant="surface" className="p-4">
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Rasgos raciales
      </h2>

      <div className="space-y-4">
        {traits.map((trait, idx) => (
          <TraitRow key={`${trait.name}-${idx}`} trait={trait} />
        ))}
      </div>
    </Card>
  );
}

interface TraitRowProps {
  trait: RacialTrait;
}

function TraitRow({ trait }: TraitRowProps) {
  return (
    <div className="space-y-1">
      {/* Name + source badge — inline, mobile-first single column */}
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-ink leading-tight">{trait.name}</p>
        {trait.source === 'subrace' ? (
          <Pill tone="pink" size="sm">Sublinaje</Pill>
        ) : (
          <Pill tone="stone" size="sm">Linaje</Pill>
        )}
      </div>

      {/* Text body — whitespace-pre-wrap so \n\n produces visible paragraph breaks */}
      <p className="text-xs text-ink-soft whitespace-pre-wrap leading-relaxed">
        {/* 5etools {@...} tokens preserved raw — render-time parsing is a future web concern. */}
        {trait.text}
      </p>
    </div>
  );
}
