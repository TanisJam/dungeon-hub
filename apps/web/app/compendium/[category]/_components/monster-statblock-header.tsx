// MonsterStatblockHeader — full D&D 5e stat block header for monsters (ADR-5, REQ-CBROWSE-07).
// Reads the full Drizzle row: extracted columns (name, cr, type, size) + data JSONB
// (the raw 5etools bestiary object: ac[], hp, speed, str/dex/con/int/wis/cha, trait[], action[], etc.)
//
// Design decision (ADR-5 Batch 3): the header IS the complete stat block —
// meta block + ability grid + traits + actions. The detail-sheet body renders
// data.entries[] which is empty for monsters, so the header carries all content.
//
// PHB 2014 p.173: ability modifier = floor((score - 10) / 2)
// MM 2014 p.6-11: reading a stat block

// ---------------------------------------------------------------------------
// Size codes → labels (5etools single-char codes, MM p.6)
// ---------------------------------------------------------------------------
const SIZE_LABELS: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

function sizeLabel(code: string | null | undefined): string {
  if (!code) return '';
  return SIZE_LABELS[code] ?? code;
}

// ---------------------------------------------------------------------------
// Type formatter — 5etools type can be a string or { type, tags[] }
// ---------------------------------------------------------------------------
function typeLabel(raw: string | { type: string; tags?: string[] } | null | undefined): string {
  if (!raw) return '—';
  if (typeof raw === 'string') return raw;
  const base = raw.type ?? '';
  const tags = raw.tags && raw.tags.length > 0 ? ` (${raw.tags.join(', ')})` : '';
  return `${base}${tags}`;
}

// ---------------------------------------------------------------------------
// Alignment codes → readable (MM p.7, abbreviated)
// ---------------------------------------------------------------------------
const ALIGN_MAP: Record<string, string> = {
  L: 'Lawful',
  N: 'Neutral',
  C: 'Chaotic',
  G: 'Good',
  E: 'Evil',
  U: 'Unaligned',
  A: 'Any',
};

function alignmentLabel(alignment: string[] | undefined): string {
  if (!alignment || alignment.length === 0) return '';
  // Handle special single-value cases
  if (alignment.length === 1) return ALIGN_MAP[alignment[0] ?? ''] ?? alignment[0] ?? '';
  // Two-part: e.g. ['N','E'] → 'Neutral Evil', ['C','E'] → 'Chaotic Evil'
  return alignment.map((a) => ALIGN_MAP[a] ?? a).join(' ');
}

// ---------------------------------------------------------------------------
// AC formatter — ac can be [{ac, from[]}] or just [{ac}] or a number
// ---------------------------------------------------------------------------
type AcEntry = { ac: number; from?: string[] } | number;

function acLabel(ac: AcEntry[] | undefined): string {
  if (!ac || ac.length === 0) return '—';
  const first = ac[0];
  if (first == null) return '—';
  if (typeof first === 'number') return String(first);
  const base = String(first.ac);
  // Strip 5etools {@item ...} tags from "from" labels for display
  const fromParts =
    first.from && first.from.length > 0
      ? first.from.map((s) => s.replace(/\{@\w+\s([^|]+)(?:\|[^}]*)?\}/g, '$1'))
      : [];
  return fromParts.length > 0 ? `${base} (${fromParts.join(', ')})` : base;
}

// ---------------------------------------------------------------------------
// Speed formatter (shared with RaceHeader pattern — objects or numeric)
// ---------------------------------------------------------------------------
type SpeedValue = number | { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number; [key: string]: unknown };

function speedLabel(speed: SpeedValue | undefined): string {
  if (speed == null) return '—';
  if (typeof speed === 'number') return `${speed} ft.`;
  const parts: string[] = [];
  if (speed.walk != null) parts.push(`${speed.walk} ft.`);
  if (speed.fly != null) parts.push(`fly ${speed.fly} ft.`);
  if (speed.swim != null) parts.push(`swim ${speed.swim} ft.`);
  if (speed.climb != null) parts.push(`climb ${speed.climb} ft.`);
  if (speed.burrow != null) parts.push(`burrow ${speed.burrow} ft.`);
  return parts.length > 0 ? parts.join(', ') : '—';
}

// ---------------------------------------------------------------------------
// Ability score modifier — PHB p.173
// modifier = floor((score - 10) / 2)
// ---------------------------------------------------------------------------

/** Returns signed modifier string: "+2", "−1", "+0". Uses Unicode minus for negative. */
function signedMod(score: number | undefined): string {
  if (score == null) return '';
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

// ---------------------------------------------------------------------------
// Saving throws formatter — { str: '+2', dex: '-1', ... }
// ---------------------------------------------------------------------------
const ABILITY_ABBR: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

function savesLabel(save: Record<string, string> | undefined): string {
  if (!save) return '';
  return Object.entries(save)
    .map(([k, v]) => `${ABILITY_ABBR[k] ?? k.toUpperCase()} ${v}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Skills formatter
// ---------------------------------------------------------------------------
function skillsLabel(skill: Record<string, string> | undefined): string {
  if (!skill) return '';
  return Object.entries(skill)
    .map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)} ${v}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Senses formatter — array of strings + passive perception
// ---------------------------------------------------------------------------
function sensesLabel(senses: string[] | undefined, passive: number | undefined): string {
  const parts: string[] = senses ? [...senses] : [];
  if (passive != null) parts.push(`passive Perception ${passive}`);
  return parts.join(', ') || '—';
}

// ---------------------------------------------------------------------------
// Strip 5etools inline tags for plain-text rendering
// e.g. {@action Disengage} → Disengage, {@hit 4} → +4, {@damage 1d6 + 2} → 1d6 + 2
// ---------------------------------------------------------------------------
function stripTags(text: string): string {
  return text
    .replace(/\{@(?:action|skill|condition|sense|item|spell|creature|dc|atk m?r?w?)\s([^|}]+)(?:\|[^}]*)?\}/g, '$1')
    .replace(/\{@h\}/g, 'Hit: ')
    .replace(/\{@hit (\d+)\}/g, '+$1')
    .replace(/\{@damage ([^}]+)\}/g, '$1')
    .replace(/\{@[^}]+\}/g, '') // strip any remaining tags
    .trim();
}

// ---------------------------------------------------------------------------
// Section block — renders trait/action/legendary arrays
// ---------------------------------------------------------------------------
interface StatEntry {
  name: string;
  entries: string[];
}

interface SectionProps {
  title: string;
  items: StatEntry[];
  testId?: string;
}

function Section({ title, items, testId }: SectionProps) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3" data-section={testId}>
      <div className="border-t border-line pt-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft mb-2">{title}</div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx}>
              <span className="text-xs font-semibold text-ink">{item.name}. </span>
              <span className="text-xs text-ink-soft">
                {item.entries.map((e) => stripTags(e)).join(' ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AbilityCell — one stat (label + score + modifier)
// @375px: inside a grid-cols-3 × 2 rows layout — must stay compact
// ---------------------------------------------------------------------------

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type AbilityKey = (typeof ABILITY_KEYS)[number];
const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

// ---------------------------------------------------------------------------
// API row shape
// ---------------------------------------------------------------------------

interface MonsterData {
  // 5etools raw fields stored in JSONB
  size?: string[];
  type?: string | { type: string; tags?: string[] };
  alignment?: string[];
  ac?: AcEntry[];
  hp?: { average: number; formula: string };
  speed?: SpeedValue;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  save?: Record<string, string>;
  skill?: Record<string, string>;
  senses?: string[];
  passive?: number;
  languages?: string[];
  cr?: string;
  trait?: StatEntry[];
  action?: StatEntry[];
  reaction?: StatEntry[];
  legendary?: StatEntry[];
  [key: string]: unknown;
}

interface MonsterDetailRow {
  id?: string;
  slug: string;
  source: string;
  name: string;
  cr?: string | null;
  crNumeric?: string | null;
  type?: string | null;
  size?: string | null;
  data: MonsterData;
}

interface MonsterStatblockHeaderProps {
  data: MonsterDetailRow;
}

/**
 * MonsterStatblockHeader — full D&D 5e stat block for the compendium detail sheet.
 * ADR-5 (Batch 3): the header IS the complete stat block — meta + ability grid + traits/actions.
 * The detail-sheet body renders data.entries[] which is empty for monsters.
 *
 * Mobile-first @375px: ability grid is grid-cols-3 (3 stats × 2 rows) to avoid horizontal scroll.
 * REQ-CBROWSE-09: no horizontal overflow at 375px.
 */
export function MonsterStatblockHeader({ data }: MonsterStatblockHeaderProps) {
  const d = data.data;

  // Extracted columns take precedence; fall back to JSONB for the display type (with tags)
  const displaySize = sizeLabel(data.size ?? (d.size ? d.size[0] : null));
  // Use JSONB type for the full label (with goblinoid tags etc.), extracted type for fallback
  const displayType = typeLabel(d.type ?? data.type);
  const alignment = alignmentLabel(d.alignment);

  const saves = savesLabel(d.save);
  const skills = skillsLabel(d.skill);
  const languages = d.languages?.join(', ') ?? '—';
  const senses = sensesLabel(d.senses, d.passive);

  return (
    <div className="compendium-init-detail monster">
      {/* Name */}
      <div className="name">{data.name}</div>

      {/* Size / Type / Alignment */}
      <div className="eyebrow capitalize" data-field="type-size">
        {[displaySize, displayType, alignment].filter(Boolean).join(' ')}
      </div>

      {/* Divider */}
      <div className="border-t border-red-800/30 my-2" />

      {/* Primary stats: AC / HP / Speed */}
      <div className="grid grid-cols-1 gap-1 text-xs">
        <div className="meta-row">
          <div className="k">Armor Class</div>
          <div className="v" data-field="ac">{acLabel(d.ac)}</div>
        </div>
        {d.hp && (
          <div className="meta-row">
            <div className="k">Hit Points</div>
            <div className="v" data-field="hp">{d.hp.average} ({d.hp.formula})</div>
          </div>
        )}
        <div className="meta-row">
          <div className="k">Speed</div>
          <div className="v" data-field="speed">{speedLabel(d.speed)}</div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-red-800/30 my-2" />

      {/* Ability scores — grid-cols-3 @375px: 3 stats per row, 2 rows total */}
      <div
        className="grid grid-cols-3 gap-1 text-center text-xs"
        data-field="ability-scores"
      >
        {ABILITY_KEYS.map((key) => {
          const score = d[key] as number | undefined;
          return (
            <div
              key={key}
              className="flex flex-col items-center rounded bg-surface px-1 py-1.5"
              data-field={`ability-${key}`}
            >
              <div className="font-semibold text-ink-soft">{ABILITY_LABELS[key]}</div>
              <div className="text-ink">
                {score ?? '—'} ({signedMod(score)})
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-red-800/30 my-2" />

      {/* Secondary stats: saves, skills, senses, languages, CR */}
      <div className="grid grid-cols-1 gap-1 text-xs">
        {saves && (
          <div className="meta-row">
            <div className="k">Saving Throws</div>
            <div className="v" data-field="saves">{saves}</div>
          </div>
        )}
        {skills && (
          <div className="meta-row">
            <div className="k">Skills</div>
            <div className="v" data-field="skills">{skills}</div>
          </div>
        )}
        <div className="meta-row">
          <div className="k">Senses</div>
          <div className="v" data-field="senses">{senses}</div>
        </div>
        <div className="meta-row">
          <div className="k">Languages</div>
          <div className="v" data-field="languages">{languages}</div>
        </div>
        <div className="meta-row">
          <div className="k">Challenge</div>
          <div className="v" data-field="cr">{data.cr ?? d.cr ?? '—'}</div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-red-800/30 my-2" />

      {/* Traits */}
      <Section title="Traits" items={d.trait ?? []} testId="traits" />

      {/* Actions */}
      <Section title="Actions" items={d.action ?? []} testId="actions" />

      {/* Reactions */}
      <Section title="Reactions" items={d.reaction ?? []} testId="reactions" />

      {/* Legendary Actions */}
      <Section title="Legendary Actions" items={d.legendary ?? []} testId="legendary" />
    </div>
  );
}
