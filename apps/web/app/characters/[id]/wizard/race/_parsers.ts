// Parsers para el shape de races de 5etools. Versión simplificada del bot's
// embeds/race.ts — devolvemos data estructurada en vez de strings para Discord.
// TODO si esto crece, extraer a un package compartido packages/5etools-render.

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export type AsiSlot =
  | { kind: 'fixed'; ability: AbilityKey; bonus: number }
  | { kind: 'choose'; from: AbilityKey[]; amount: number; count: number };

/** Minimal shape of a normalized racial spell entry. Only the fields needed by the web picker. */
export type RaceInnateSpellLite = {
  slug: string;
  source: string;
  characterLevelAvailable: 1 | 3 | 5;
  frequency: 'at-will' | 'daily-1';
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  isPlayerChoice?: boolean;
  fromClass?: string;
};

export type RaceData = {
  name: string;
  source: string;
  page?: number;
  size?: string[];
  speed?: number | Record<string, number | boolean>;
  ability?: Array<Record<string, number | { from?: string[]; amount?: number; count?: number }>>;
  languageProficiencies?: Array<Record<string, boolean | number>>;
  skillProficiencies?: Array<Record<string, boolean | number | { from?: string[]; count?: number }>>;
  feats?: Array<Record<string, number>>;
  entries?: unknown[];
  raceName?: string;
  /**
   * Normalized racial spells projected from the compendium DB (Batch 6).
   * Used by RaceDetailPanel to detect isPlayerChoice slots (High Elf cantrip).
   */
  additionalSpellsNormalized?: RaceInnateSpellLite[];
};

/**
 * Counts the number of free ("any: N") skill picks a race/subrace grants.
 * Returns 0 for races with no skill grants.
 */
export function countRaceSkillGrants(input: {
  race: RaceData;
  subrace?: RaceData | null;
}): number {
  let count = 0;
  const consume = (blocks: RaceData['skillProficiencies']) => {
    if (!blocks) return;
    for (const block of blocks) {
      for (const [k, v] of Object.entries(block)) {
        if (k === 'any' && typeof v === 'number') {
          count += v;
        } else if (
          k === 'choose' &&
          typeof v === 'object' &&
          v !== null &&
          typeof (v as { count?: number }).count === 'number'
        ) {
          count += (v as { count: number }).count;
        }
      }
    }
  };
  consume(input.race.skillProficiencies);
  consume(input.subrace?.skillProficiencies);
  return count;
}

/**
 * Counts the number of free ("any: N") feat grants a race/subrace provides.
 * Returns 0 for races without feat grants.
 */
export function countRaceFeatGrants(input: {
  race: RaceData;
  subrace?: RaceData | null;
}): number {
  let count = 0;
  const consume = (blocks: RaceData['feats']) => {
    if (!blocks) return;
    for (const block of blocks) {
      const v = block['any'];
      if (typeof v === 'number') count += v;
    }
  };
  consume(input.race.feats);
  consume(input.subrace?.feats);
  return count;
}

const SIZE_NAMES: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

export function formatSize(size: string[] | undefined): string {
  if (!size?.length) return 'Medium';
  return size.map((s) => SIZE_NAMES[s] ?? s).join('/');
}

export function formatSpeed(speed: RaceData['speed']): string {
  if (speed === undefined) return '30 ft.';
  if (typeof speed === 'number') return `${speed} ft.`;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(speed)) {
    if (v === false) continue;
    const amount = typeof v === 'number' ? v : 30;
    if (k === 'walk') parts.unshift(`${amount} ft.`);
    else parts.push(`${k} ${amount} ft.`);
  }
  return parts.join(', ');
}

/**
 * MPMM "Custom Origin" default bag — `+2` y `+1` libres a abilities distintas.
 * El validator del API espera este bag cuando race y subrace no tienen el
 * field `ability` (convención 5etools post-2024 + MPMM).
 */
export function mpmmSyntheticSlots(): AsiSlot[] {
  return [
    { kind: 'choose', from: [...ABILITY_KEYS], amount: 2, count: 1 },
    { kind: 'choose', from: [...ABILITY_KEYS], amount: 1, count: 1 },
  ];
}

/**
 * Slots efectivos de ASI considerando la combinación race + subrace.
 *
 * Si parent y selected no tienen ability data (raza estilo MPMM/2024), devuelve
 * los slots sintéticos +2/+1 en el bucket 'race'. Esto matchea la lógica del
 * validator del API (`raceIsEmpty && !subraceHasChoose`).
 */
export function effectiveAsiSlots(input: {
  parentAbility: RaceData['ability'];
  selectedAbility: RaceData['ability'];
  selectedIsSubrace: boolean;
}): { raceSlots: AsiSlot[]; subraceSlots: AsiSlot[] } {
  const parentSlots = parseAsis(input.parentAbility);
  const selectedSlots = parseAsis(input.selectedAbility);

  if (parentSlots.length + selectedSlots.length === 0) {
    return { raceSlots: mpmmSyntheticSlots(), subraceSlots: [] };
  }

  if (input.selectedIsSubrace) {
    return { raceSlots: parentSlots, subraceSlots: selectedSlots };
  }
  return { raceSlots: selectedSlots, subraceSlots: [] };
}

export function parseAsis(
  ability: RaceData['ability'],
): AsiSlot[] {
  if (!ability) return [];
  const slots: AsiSlot[] = [];
  for (const entry of ability) {
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'choose' && typeof v === 'object' && v !== null) {
        const c = v as { from?: string[]; amount?: number; count?: number };
        const amount = c.amount ?? 1;
        const count = c.count ?? 1;
        const from = (c.from ?? []).map((a) => a.toLowerCase()) as AbilityKey[];
        slots.push({ kind: 'choose', from, amount, count });
      } else if (typeof v === 'number' && ABILITY_KEYS.includes(k as AbilityKey)) {
        slots.push({ kind: 'fixed', ability: k as AbilityKey, bonus: v });
      }
    }
  }
  return slots;
}

export function formatAsisSummary(slots: AsiSlot[]): string {
  if (slots.length === 0) return '—';
  const parts: string[] = [];
  for (const slot of slots) {
    if (slot.kind === 'fixed') {
      const sign = slot.bonus >= 0 ? '+' : '';
      parts.push(`${sign}${slot.bonus} ${slot.ability.toUpperCase()}`);
    } else {
      parts.push(
        `+${slot.amount}×${slot.count} from ${slot.from.map((a) => a.toUpperCase()).join('/')}`,
      );
    }
  }
  return parts.join(', ');
}

export function formatLanguages(langs: RaceData['languageProficiencies']): string | null {
  if (!langs?.length) return null;
  const out: string[] = [];
  for (const entry of langs) {
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'anyStandard' || k === 'any') {
        out.push(`${typeof v === 'number' ? v : 1} of your choice`);
      } else if (v === true) {
        out.push(titleCase(k));
      }
    }
  }
  return out.length > 0 ? out.join(', ') : null;
}

/**
 * Parsea los bloques `languageProficiencies` y devuelve fijos + counts por kind
 * (anyStandard / anyExotic / any) — análogo al parser de background, pero
 * combina race + subrace.
 */
export function parseLanguageChoices(input: {
  race: RaceData;
  subrace?: RaceData | null;
}): {
  fixed: string[];
  chooseCounts: Record<string, number>;
  totalChooseCount: number;
} {
  const fixed: string[] = [];
  const chooseCounts: Record<string, number> = {};

  const consume = (blocks: RaceData['languageProficiencies']) => {
    if (!blocks) return;
    for (const block of blocks) {
      for (const [k, v] of Object.entries(block)) {
        if (k === 'anyStandard' || k === 'anyExotic' || k === 'any') {
          if (typeof v === 'number') {
            chooseCounts[k] = (chooseCounts[k] ?? 0) + v;
          }
        } else if (v === true) {
          fixed.push(k.toLowerCase());
        }
      }
    }
  };

  consume(input.race.languageProficiencies);
  consume(input.subrace?.languageProficiencies ?? undefined);

  const totalChooseCount = Object.values(chooseCounts).reduce((s, n) => s + n, 0);
  return { fixed, chooseCounts, totalChooseCount };
}

export type Trait = { name: string; text: string };

const NAMED_BLOCK_TYPES = new Set(['entries', 'inset', 'section']);

export function extractTraits(entries: unknown[] | undefined): Trait[] {
  if (!entries) return [];
  const traits: Trait[] = [];
  for (const e of entries) {
    if (e == null) continue;
    if (typeof e === 'string') {
      const txt = stripInlineTags(e);
      if (txt) traits.push({ name: 'Description', text: txt });
      continue;
    }
    if (typeof e !== 'object') continue;
    const obj = e as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : '';
    if (NAMED_BLOCK_TYPES.has(type) && typeof obj.name === 'string') {
      const text = flattenEntries(obj.entries);
      if (text) traits.push({ name: obj.name as string, text });
    }
  }
  return traits;
}

// 5etools inline tags simplificados: {@tag content} → keep display piece.
// No tan poderoso como el del bot pero suficiente para mostrar trait text legible.
function stripInlineTags(input: string): string {
  return input.replace(/\{@\w+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1');
}

function flattenEntries(entries: unknown, maxLen = 600): string {
  if (!entries) return '';
  const parts: string[] = [];
  walk(entries, parts);
  let out = parts.join(' ').trim();
  if (out.length > maxLen) out = out.slice(0, maxLen - 1) + '…';
  return out;
}

function walk(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === 'string') {
    out.push(stripInlineTags(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.entries !== 'undefined') walk(obj.entries, out);
    if (Array.isArray(obj.items)) walk(obj.items, out);
  }
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
