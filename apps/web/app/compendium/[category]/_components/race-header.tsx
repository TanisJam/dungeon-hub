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
// Damage type labels (Spanish) — PHB p.34 Draconic Ancestry table constrains
// this to acid, cold, fire, lightning, poison. Unknown codes fall back to the
// raw string rather than throwing (compendium-import/race/types.ts:20 notes
// damageType is stored as `string`, not a union, for future-proofing).
// ---------------------------------------------------------------------------
const DAMAGE_TYPE_LABELS: Record<string, string> = {
  acid: 'ácido',
  cold: 'frío',
  fire: 'fuego',
  lightning: 'rayo',
  poison: 'veneno',
};

function damageTypeLabel(damageType: string): string {
  return DAMAGE_TYPE_LABELS[damageType.toLowerCase()] ?? damageType;
}

const BREATH_SHAPE_LABELS: Record<string, string> = {
  line: 'línea',
  cone: 'cono',
};

// ---------------------------------------------------------------------------
// Breath weapon formatter — Dragonborn ancestry rows only (PHB p.34).
// data.breathWeapon: { damageType, shape, size, savingThrow }. Defensive: any
// missing/non-string field renders nothing rather than a partial/garbled row.
// ---------------------------------------------------------------------------
interface BreathWeaponData {
  damageType?: unknown;
  shape?: unknown;
  size?: unknown;
  savingThrow?: unknown;
}

function breathWeaponLabel(breathWeapon: BreathWeaponData | undefined): string | null {
  if (!breathWeapon || typeof breathWeapon !== 'object') return null;
  const { damageType, shape, size, savingThrow } = breathWeapon;
  if (
    typeof damageType !== 'string' ||
    typeof shape !== 'string' ||
    typeof size !== 'string' ||
    typeof savingThrow !== 'string'
  ) {
    return null;
  }
  const shapeLabel = BREATH_SHAPE_LABELS[shape] ?? shape;
  const saveLabel = ABILITY_LABELS[savingThrow] ?? savingThrow.toUpperCase();
  return `${damageTypeLabel(damageType)}, ${shapeLabel} de ${size}, salvación de ${saveLabel}`;
}

// ---------------------------------------------------------------------------
// Damage resistance formatter — Dragonborn ancestry rows only.
// data.resist: string[] on synthesized ancestry rows. Some non-ancestry race
// rows carry a `resist: [{ choose: {...} }]` shape upstream (unresolved
// choice) — filtered out defensively rather than rendered as [object Object].
// ---------------------------------------------------------------------------
function resistLabel(resist: unknown): string | null {
  if (!Array.isArray(resist) || resist.length === 0) return null;
  const types = resist.filter((r): r is string => typeof r === 'string');
  if (types.length === 0) return null;
  return types.map(damageTypeLabel).join(', ');
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
    /** Dragonborn ancestry rows only (PHB p.34) — dragonborn--black, --blue, etc. */
    breathWeapon?: BreathWeaponData;
    /** Dragonborn ancestry rows only (PHB p.34). */
    resist?: unknown;
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
  const breathWeapon = breathWeaponLabel(data.data.breathWeapon);
  const resist = resistLabel(data.data.resist);

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
        {breathWeapon != null && (
          <MetaRow label="Arma de aliento" value={breathWeapon} field="breath-weapon" />
        )}
        {resist != null && (
          <MetaRow label="Resistencia al daño" value={resist} field="resist" />
        )}
      </div>
    </div>
  );
}
