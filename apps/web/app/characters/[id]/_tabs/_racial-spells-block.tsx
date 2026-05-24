/**
 * RacialSpellsBlock — Server Component.
 *
 * Renders the "Hechizos raciales" section on the character sheet.
 * Groups spells by frequency: at-will (Cantrip) first, then daily-1.
 * Renders nothing when racialSpells is empty.
 *
 * Mobile-first (375px primary). No client-side interactivity needed.
 * PHB p.23 (High Elf), PHB p.24 (Drow), PHB p.37 (Forest Gnome), PHB p.42-43 (Tiefling).
 */
import { Card } from '@/components/ui';
import type { RacialSpellView } from '@/lib/sheet-types';

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const ABILITY_ES: Record<string, string> = {
  str: 'FUE',
  dex: 'DES',
  con: 'CON',
  int: 'INT',
  wis: 'SAB',
  cha: 'CAR',
};

/** Human-readable frequency label for each bucket. */
function frequencyLabel(frequency: RacialSpellView['frequency']): string {
  switch (frequency) {
    case 'at-will':
      return 'A voluntad';
    case 'daily-1':
      return '1/descanso largo';
  }
}

interface RacialSpellsBlockProps {
  racialSpells: RacialSpellView[];
}

export function RacialSpellsBlock({ racialSpells }: RacialSpellsBlockProps) {
  if (racialSpells.length === 0) return null;

  // Group: at-will (cantrips) first, then daily-1
  const atWill = racialSpells.filter((s) => s.frequency === 'at-will');
  const daily1 = racialSpells.filter((s) => s.frequency === 'daily-1');

  return (
    <Card variant="surface" className="p-4">
      <h2 className="mb-3 text-[10px] font-bold uppercase tracking-wide text-ink-mute">
        Hechizos raciales
      </h2>

      <div className="space-y-3">
        {atWill.length > 0 && (
          <SpellGroup label="A voluntad" spells={atWill} />
        )}
        {daily1.length > 0 && (
          <SpellGroup label="1/descanso largo" spells={daily1} />
        )}
      </div>
    </Card>
  );
}

interface SpellGroupProps {
  label: string;
  spells: RacialSpellView[];
}

function SpellGroup({ label, spells }: SpellGroupProps) {
  return (
    <div>
      <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-ink-mute">
        {label}
      </p>
      <div className="space-y-1.5">
        {spells.map((spell) => (
          <SpellRow key={`${spell.slug}-${spell.characterLevelAvailable}`} spell={spell} />
        ))}
      </div>
    </div>
  );
}

interface SpellRowProps {
  spell: RacialSpellView;
}

function SpellRow({ spell }: SpellRowProps) {
  const freqBadge = frequencyLabel(spell.frequency);
  const abilityLabel = ABILITY_ES[spell.ability] ?? spell.ability.toUpperCase();

  return (
    <div className="flex items-center justify-between rounded-sm border border-line bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        {/* Spell name */}
        <p className="truncate text-sm font-medium text-ink">
          {titleCase(spell.slug)}
          {spell.isPlayerChoice && (
            <span className="ml-1.5 text-[10px] font-normal text-ink-soft">(de raza)</span>
          )}
        </p>

        {/* Meta row: ability + level gate + cast level */}
        <p className="mt-0.5 text-[10px] text-ink-mute">
          {abilityLabel}
          {spell.characterLevelAvailable > 1 && (
            <span> · Nv {spell.characterLevelAvailable}</span>
          )}
          {spell.castLevel != null && (
            <span> · nivel {spell.castLevel}</span>
          )}
        </p>
      </div>

      {/* Frequency badge */}
      <span className="ml-2 flex-shrink-0 rounded-full bg-paper-soft px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-mute">
        {freqBadge}
      </span>
    </div>
  );
}
