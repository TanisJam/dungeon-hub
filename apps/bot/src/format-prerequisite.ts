/**
 * Formatea el array `prerequisite` de un feat/optional-feature de 5etools
 * a una línea de texto leíble.
 *
 * Cada entry del array es una alternativa (OR entre entries). Dentro de cada
 * entry, las keys son requirements AND.
 *
 * Examples:
 *   [{"ability": [{"str": 13}]}] → "Str 13"
 *   [{"ability": [{"str": 13, "dex": 13}]}] → "Str 13 or Dex 13"
 *   [{"race": [{"name": "Elf"}]}] → "Elf"
 *   [{"spellcasting": true}] → "Ability to cast at least one spell"
 *   [{"proficiency": [{"armor": "medium"}]}] → "Proficiency with medium armor"
 */

interface PrereqAbility { [ability: string]: number }
interface PrereqRace { name?: string; subrace?: string }
interface PrereqProficiency { armor?: string; weapon?: string }
interface PrereqEntry {
  ability?: PrereqAbility[];
  race?: PrereqRace[];
  proficiency?: PrereqProficiency[];
  spellcasting?: boolean;
  spellcasting2020?: boolean;
  spellcastingFeature?: boolean;
  spellcastingPrepared?: boolean;
  spellcastingFocus?: boolean;
  level?: number | { level: number; class?: { name: string } };
  feat?: string[];
  feature?: string[];
  other?: string;
  alignment?: string[];
}

const ABILITY_NAMES: Record<string, string> = {
  str: 'Str',
  dex: 'Dex',
  con: 'Con',
  int: 'Int',
  wis: 'Wis',
  cha: 'Cha',
};

function abilityToString(a: PrereqAbility): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(a)) {
    parts.push(`${ABILITY_NAMES[k] ?? k.toUpperCase()} ${v}`);
  }
  return parts.join(' or ');
}

function raceToString(r: PrereqRace): string {
  if (r.subrace && r.name) return `${r.subrace} ${r.name}`;
  return r.name ?? r.subrace ?? 'specific race';
}

function proficiencyToString(p: PrereqProficiency): string {
  if (p.armor) return `proficiency with ${p.armor} armor`;
  if (p.weapon) return `proficiency with ${p.weapon} weapons`;
  return 'specific proficiency';
}

function entryToString(e: PrereqEntry): string {
  const reqs: string[] = [];

  if (e.ability && e.ability.length > 0) {
    reqs.push(e.ability.map(abilityToString).join(', '));
  }
  if (e.race && e.race.length > 0) {
    reqs.push(e.race.map(raceToString).join(' or '));
  }
  if (e.proficiency && e.proficiency.length > 0) {
    reqs.push(e.proficiency.map(proficiencyToString).join(' or '));
  }
  if (e.spellcasting || e.spellcasting2020 || e.spellcastingFeature) {
    reqs.push('Ability to cast at least one spell');
  }
  if (e.spellcastingPrepared) reqs.push('Spellcasting class with Prepared list');
  if (e.spellcastingFocus) reqs.push('Spellcasting Focus feature');
  if (typeof e.level === 'number') reqs.push(`Level ${e.level}`);
  else if (e.level && typeof e.level === 'object') {
    const cls = e.level.class?.name ? ` ${e.level.class.name}` : '';
    reqs.push(`Level ${e.level.level}${cls}`);
  }
  if (e.feat && e.feat.length > 0) reqs.push(`${e.feat.join(' or ')} feat`);
  if (e.feature && e.feature.length > 0) reqs.push(`${e.feature.join(' or ')} feature`);
  if (e.alignment && e.alignment.length > 0) reqs.push(`${e.alignment.join(' or ')} alignment`);
  if (e.other) reqs.push(e.other);

  return reqs.length > 0 ? reqs.join(', ') : '—';
}

export function formatPrerequisite(prereq: unknown): string | null {
  if (!Array.isArray(prereq) || prereq.length === 0) return null;
  const parts = (prereq as PrereqEntry[]).map(entryToString).filter((s) => s !== '—');
  if (parts.length === 0) return null;
  return parts.join(' OR ');
}
