import type { AppliedClass } from '../class/types.js';
import { classifyCaster } from './caster-type.js';
import { computeSpellLimits, type SpellLimitsView } from './preparation.js';

export interface SpellRef {
  slug: string;
  source: string;
}

/** Spell del compendio (lite) para validación. */
export interface SpellLite {
  slug: string;
  source: string;
  /** 0 = cantrip. */
  level: number;
}

export interface ClassSpellsInput {
  cantrips?: SpellRef[];
  known?: SpellRef[];
  prepared?: SpellRef[];
}

export interface AppliedClassSpells {
  cantrips: SpellRef[];
  known: SpellRef[];
  prepared: SpellRef[];
}

export type SpellsValidationIssue =
  | { code: 'CLASS_NOT_CASTER'; classSlug: string }
  | { code: 'SPELL_NOT_FOUND'; spell: SpellRef }
  | { code: 'SPELL_NOT_IN_CLASS_LIST'; spell: SpellRef; classSlug: string }
  | { code: 'SPELL_LEVEL_TOO_HIGH'; spell: SpellRef; level: number; max: number }
  | { code: 'CANTRIP_EXPECTED'; spell: SpellRef; gotLevel: number }
  | { code: 'NOT_A_CANTRIP'; spell: SpellRef }
  | { code: 'CANTRIPS_KNOWN_EXCEEDED'; got: number; max: number }
  | { code: 'SPELLS_KNOWN_EXCEEDED'; got: number; max: number; classSlug: string }
  | { code: 'PREPARED_LIMIT_EXCEEDED'; got: number; max: number; classSlug: string }
  | { code: 'PREPARED_NOT_IN_SPELLBOOK'; spell: SpellRef }
  | { code: 'KNOWN_NOT_ALLOWED'; classSlug: string }
  | { code: 'PREPARED_NOT_ALLOWED'; classSlug: string }
  | { code: 'DUPLICATE_SPELL'; spell: SpellRef; bucket: 'cantrips' | 'known' | 'prepared' };

export type SpellsValidationResult =
  | { ok: true; applied: AppliedClassSpells; limits: SpellLimitsView }
  | { ok: false; issues: SpellsValidationIssue[] };

function keyOf(s: SpellRef): string {
  return `${s.slug}|${s.source}`;
}

function dedupeAndCheck(
  arr: SpellRef[] | undefined,
  bucket: 'cantrips' | 'known' | 'prepared',
  issues: SpellsValidationIssue[],
): SpellRef[] {
  const out: SpellRef[] = [];
  const seen = new Set<string>();
  for (const s of arr ?? []) {
    const k = keyOf(s);
    if (seen.has(k)) {
      issues.push({ code: 'DUPLICATE_SPELL', spell: s, bucket });
      continue;
    }
    seen.add(k);
    out.push(s);
  }
  return out;
}

/**
 * Valida la selección de spells de UNA clase del personaje contra:
 * - Existencia + nivel en `availableSpells` (ya filtrado por Rules Profile + class list).
 * - Límites de cantrips known.
 * - Límites de spells known (clases known) o prepared (clases prep).
 * - Wizard: prepared debe ser subset de known (spellbook).
 *
 * El caller es responsable de:
 *   - Resolver `abilityMod` para la `SPELLCASTING_ABILITY` de la clase a partir
 *     de los effective scores del personaje.
 *   - Cargar `availableSpells` filtrando compendium_spells por: `classes`
 *     contiene `c.slug` + source habilitada + slug no deshabilitado.
 */
export function validateClassSpells(args: {
  appliedClass: AppliedClass;
  abilityMod: number;
  availableSpells: ReadonlyArray<SpellLite>;
  input: ClassSpellsInput;
}): SpellsValidationResult {
  const { appliedClass, abilityMod, availableSpells, input } = args;
  const issues: SpellsValidationIssue[] = [];

  const casterType = classifyCaster(appliedClass);
  if (casterType === 'none') {
    return {
      ok: false,
      issues: [{ code: 'CLASS_NOT_CASTER', classSlug: appliedClass.slug }],
    };
  }

  const limits = computeSpellLimits(appliedClass, abilityMod);

  const spellByKey = new Map<string, SpellLite>();
  for (const s of availableSpells) spellByKey.set(keyOf(s), s);

  const cantrips = dedupeAndCheck(input.cantrips, 'cantrips', issues);
  const known = dedupeAndCheck(input.known, 'known', issues);
  const prepared = dedupeAndCheck(input.prepared, 'prepared', issues);

  // Validar cada spell: existencia + level válido.
  const validateSpell = (s: SpellRef, expectCantrip: boolean): SpellLite | null => {
    const lite = spellByKey.get(keyOf(s));
    if (!lite) {
      issues.push({ code: 'SPELL_NOT_IN_CLASS_LIST', spell: s, classSlug: appliedClass.slug });
      return null;
    }
    if (expectCantrip && lite.level !== 0) {
      issues.push({ code: 'NOT_A_CANTRIP', spell: s });
      return null;
    }
    if (!expectCantrip && lite.level === 0) {
      issues.push({ code: 'CANTRIP_EXPECTED', spell: s, gotLevel: 0 });
      return null;
    }
    if (!expectCantrip && lite.level > limits.maxSpellLevel) {
      issues.push({
        code: 'SPELL_LEVEL_TOO_HIGH',
        spell: s,
        level: lite.level,
        max: limits.maxSpellLevel,
      });
      return null;
    }
    return lite;
  };

  for (const c of cantrips) validateSpell(c, true);
  for (const s of known) validateSpell(s, false);
  for (const s of prepared) validateSpell(s, false);

  // Cantrips count.
  if (cantrips.length > limits.cantripsKnown) {
    issues.push({ code: 'CANTRIPS_KNOWN_EXCEEDED', got: cantrips.length, max: limits.cantripsKnown });
  }

  // Known: aplicable a clases known fijo + Wizard (spellbook).
  //
  // Wizard NO tiene cap superior en known: el spellbookSize es el MÍNIMO (free
  // spells por level up), pero podés copiar más con gold (PHB p.114 — 50 gp ×
  // nivel del spell). Por eso `wizardSpellbookSize` queda como info en `limits`
  // y no se enforce acá.
  const isWizard = appliedClass.slug === 'wizard';
  if (limits.spellsKnown !== null) {
    if (known.length > limits.spellsKnown) {
      issues.push({
        code: 'SPELLS_KNOWN_EXCEEDED',
        got: known.length,
        max: limits.spellsKnown,
        classSlug: appliedClass.slug,
      });
    }
  } else if (!isWizard && known.length > 0) {
    // Clases prep que NO usan known (Cleric, Druid, Paladin, Artificer).
    issues.push({ code: 'KNOWN_NOT_ALLOWED', classSlug: appliedClass.slug });
  }

  // Prepared: aplicable a prep casters.
  if (limits.spellsPrepared !== null) {
    if (prepared.length > limits.spellsPrepared) {
      issues.push({
        code: 'PREPARED_LIMIT_EXCEEDED',
        got: prepared.length,
        max: limits.spellsPrepared,
        classSlug: appliedClass.slug,
      });
    }
    // Wizard: prepared debe ser subset del spellbook (known).
    if (appliedClass.slug === 'wizard') {
      const spellbook = new Set(known.map(keyOf));
      for (const p of prepared) {
        if (!spellbook.has(keyOf(p))) {
          issues.push({ code: 'PREPARED_NOT_IN_SPELLBOOK', spell: p });
        }
      }
    }
  } else if (prepared.length > 0) {
    // Clases known que no preparan diario (Bard, Sorc, Warlock, Ranger, EK, AT).
    issues.push({ code: 'PREPARED_NOT_ALLOWED', classSlug: appliedClass.slug });
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    applied: { cantrips, known, prepared },
    limits,
  };
}
