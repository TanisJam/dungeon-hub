export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

const ABILITY_LABELS: Record<string, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

export type ProfItem = string | { proficiency?: string; full?: string };

export type SkillChoice = { from: string[]; count: number };

export type ClassData = {
  name: string;
  source: string;
  page?: number;
  hd?: { number: number; faces: number };
  proficiency?: string[]; // saves
  primaryAbility?: Array<Record<string, boolean>>;
  startingProficiencies?: {
    armor?: ProfItem[];
    weapons?: ProfItem[];
    tools?: ProfItem[];
    skills?: Array<{ choose?: { from?: string[]; count?: number } } | string>;
  };
  classFeatures?: Array<string | { classFeature: string }>;
  subclassTitle?: string;
};

/**
 * Detecta si esta clase requiere elegir subclass al level 1 (Cleric/Sorcerer/
 * Warlock en PHB). Lógica: el classFeatures incluye un ref con el mismo nombre
 * que `subclassTitle` a level 1. Ej. Cleric tiene "Divine Domain|Cleric||1".
 */
export function requiresL1Subclass(data: ClassData): boolean {
  if (!data.subclassTitle) return false;
  return (data.classFeatures ?? []).some((ref) => {
    const s = typeof ref === 'string' ? ref : ref.classFeature;
    if (!s) return false;
    const parts = s.split('|');
    return parts[0] === data.subclassTitle && parts[3] === '1';
  });
}

export function formatHitDie(hd: ClassData['hd']): string {
  return hd ? `d${hd.faces}` : '—';
}

export function formatSaves(saves: string[] | undefined): string {
  if (!saves?.length) return '—';
  return saves.map((s) => ABILITY_LABELS[s.toLowerCase()] ?? s.toUpperCase()).join(', ');
}

export function formatPrimary(primary: ClassData['primaryAbility']): string | null {
  if (!primary?.length) return null;
  const out = new Set<string>();
  for (const entry of primary) {
    for (const [k, v] of Object.entries(entry)) {
      if (v === true && ABILITY_LABELS[k]) out.add(ABILITY_LABELS[k]);
    }
  }
  return out.size > 0 ? Array.from(out).join(' or ') : null;
}

export function formatProfs(items: ProfItem[] | undefined): string {
  if (!items?.length) return 'none';
  return items
    .map((it) => (typeof it === 'string' ? it : it.full ?? it.proficiency ?? '—'))
    .map(stripInlineTags)
    .join(', ');
}

export function getSkillChoice(data: ClassData): SkillChoice | null {
  const skills = data.startingProficiencies?.skills;
  if (!skills) return null;
  for (const s of skills) {
    if (typeof s === 'object' && s.choose?.from) {
      return { from: s.choose.from, count: s.choose.count ?? 1 };
    }
  }
  return null;
}

export function stripInlineTags(input: string): string {
  return input.replace(/\{@\w+\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1');
}

export function titleCase(s: string): string {
  return s
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
