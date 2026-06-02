// RaceHeader — per-type detail header for races (ADR-5, REQ-CBROWSE-07).
// Reads the full Drizzle row: extracted columns + data JSONB.
// JSONB shape (5etools races.json): size[], speed, ability[], darkvision, ...
//
// PHB 2014 p.11-42 — race fields: size, speed, ability score increases.

// ---------------------------------------------------------------------------
// Size codes → labels (5etools uses single-char codes)
// ---------------------------------------------------------------------------
const SIZE_LABELS: Record<string, string> = {
  F: 'Tiny',
  D: 'Diminutive',
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
  C: 'Colossal',
};

function sizeLabel(codes: string[] | undefined): string {
  if (!codes || codes.length === 0) return '—';
  return codes.map((c) => SIZE_LABELS[c] ?? c).join(', ');
}

// ---------------------------------------------------------------------------
// Speed formatter — speed can be a number (walk) or an object with walk/fly/swim etc.
// PHB p.11
// ---------------------------------------------------------------------------
function speedLabel(speed: number | Record<string, unknown> | undefined): string {
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
// ASI formatter — PHB p.11: "ability: [{str:2},{dex:1}]" → "+2 STR, +1 DEX"
// Some races use "choose" for flexible ASIs (handled gracefully).
// ---------------------------------------------------------------------------
const ABILITY_LABELS: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

function asiLabel(ability: Array<Record<string, unknown>> | undefined): string {
  if (!ability || ability.length === 0) return '—';
  const parts: string[] = [];
  for (const entry of ability) {
    for (const [key, val] of Object.entries(entry)) {
      if (key === 'choose') {
        const choose = val as { from?: string[]; count?: number };
        const count = choose.count ?? 1;
        parts.push(`+? (${count} of your choice)`);
      } else if (ABILITY_LABELS[key]) {
        const n = val as number;
        parts.push(`${n > 0 ? '+' : ''}${n} ${ABILITY_LABELS[key]}`);
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

interface RaceDetailRow {
  slug: string;
  source: string;
  name: string;
  isSubrace: boolean;
  parentSlug?: string | null;
  parentSource?: string | null;
  data: {
    size?: string[];
    speed?: number | Record<string, unknown>;
    ability?: Array<Record<string, unknown>>;
    darkvision?: number;
    entries?: unknown[];
    [key: string]: unknown;
  };
}

interface RaceHeaderProps {
  data: RaceDetailRow;
}

/**
 * RaceHeader — per-type detail header for races (ADR-5, REQ-CBROWSE-07).
 * Mobile-first @375px key/value grid.
 *
 * PHB 2014 p.11-42 — race meta: size, speed, ability score increases.
 */
export function RaceHeader({ data }: RaceHeaderProps) {
  return (
    <div className="compendium-init-detail race">
      <div className="name">{data.name}</div>
      {data.isSubrace && data.parentSlug && (
        <div className="eyebrow capitalize">{data.parentSlug} subrace</div>
      )}

      <div className="grid">
        <MetaRow label="Tamaño" value={sizeLabel(data.data.size)} field="size" />
        <MetaRow label="Velocidad" value={speedLabel(data.data.speed)} field="speed" />
        <MetaRow label="Mejoras de habilidad" value={asiLabel(data.data.ability)} field="asi" />
        {data.data.darkvision != null && (
          <MetaRow label="Visión en la oscuridad" value={`${data.data.darkvision} ft.`} field="darkvision" />
        )}
      </div>
    </div>
  );
}
