// ClassHeader — per-type detail header for classes (ADR-5, REQ-CBROWSE-07).
// Reads the full Drizzle row: extracted columns + data JSONB.
// JSONB shape (5etools class-*.json): hd, proficiency (saving throws), startingProficiencies.
//
// PHB 2014 p.45-232 — class meta fields: hit die, saving throws, armor/weapon proficiencies.

// ---------------------------------------------------------------------------
// Ability abbreviation → label
// ---------------------------------------------------------------------------
const ABILITY_LABELS: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

function abilityLabel(abbr: string): string {
  return ABILITY_LABELS[abbr.toLowerCase()] ?? abbr.toUpperCase();
}

// ---------------------------------------------------------------------------
// Proficiency list formatter — handles strings and choose objects
// ---------------------------------------------------------------------------
function proficiencyList(items: unknown[] | undefined): string {
  if (!items || items.length === 0) return '—';
  const parts: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      // Capitalize
      parts.push(item.charAt(0).toUpperCase() + item.slice(1));
    } else if (typeof item === 'object' && item !== null) {
      // choose: { from: [...], count: n }
      const c = item as { choose?: { from?: string[]; count?: number } };
      if (c.choose) {
        const count = c.choose.count ?? 1;
        parts.push(`${count} of your choice`);
      }
    }
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

// ---------------------------------------------------------------------------
// MetaRow helper
// ---------------------------------------------------------------------------

interface MetaRowProps {
  label: string;
  value: string;
  field: string;
}

function MetaRow({ label, value, field }: MetaRowProps) {
  return (
    <div className="meta-row">
      <div className="k">{label}</div>
      <div className="v" data-field={field}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API row shape
// ---------------------------------------------------------------------------

interface ClassDetailRow {
  slug: string;
  source: string;
  name: string;
  data: {
    hd?: { number: number; faces: number };
    proficiency?: string[];
    startingProficiencies?: {
      armor?: unknown[];
      weapons?: unknown[];
      tools?: unknown[];
      skills?: unknown[];
    };
    entries?: unknown[];
    [key: string]: unknown;
  };
}

interface ClassHeaderProps {
  data: ClassDetailRow;
}

/**
 * ClassHeader — per-type detail header for classes (ADR-5, REQ-CBROWSE-07).
 * Mobile-first @375px key/value grid.
 *
 * PHB 2014 p.45 — class meta: hit die, saving throw proficiencies, armor/weapon proficiencies.
 */
export function ClassHeader({ data }: ClassHeaderProps) {
  const hd = data.data.hd;
  const hdLabel = hd ? `d${hd.faces}` : '—';

  const saves = (data.data.proficiency ?? []).map(abilityLabel).join(', ') || '—';
  const armorProfs = proficiencyList(data.data.startingProficiencies?.armor);
  const weaponProfs = proficiencyList(data.data.startingProficiencies?.weapons);

  return (
    <div className="compendium-init-detail class">
      <div className="name">{data.name}</div>

      <div className="grid">
        <MetaRow label="Dado de golpe" value={hdLabel} field="hit-die" />
        <MetaRow label="Tiradas de salvación" value={saves} field="saves" />
        <MetaRow label="Armadura" value={armorProfs} field="armor-profs" />
        <MetaRow label="Armas" value={weaponProfs} field="weapon-profs" />
      </div>
    </div>
  );
}
