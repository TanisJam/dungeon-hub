/**
 * Pure function that normalizes the 5etools `additionalSpells` JSONB field
 * into a `RaceInnateSpell[]` array.
 *
 * Spec: engram #607 (REQ-I-NORM-01..06, REQ-D-RACE-INNATE-01..04).
 * Design: engram #608 §3.1.
 * Bootstrap: engram #599 (shape grammar for PHB races).
 *
 * PHB scope: Tiefling (Shape A), Drow (Shape A), Forest Gnome (Shape C),
 * High Elf (Shape B). Other shapes emit warnings and are skipped.
 */
import type { RaceInnateSpell } from '@dungeon-hub/domain/character/race';

/** Valid character-level keys in PHB 2014 additionalSpells (decision #603). */
const VALID_CHAR_LEVELS: ReadonlySet<string> = new Set(['1', '3', '5']);

/**
 * Parses a spell tag string from 5etools into a normalized slug, source, and
 * optional castLevel.
 *
 * Examples:
 *   "thaumaturgy#c"       → { slug: 'thaumaturgy', source: 'phb' }
 *   "hellish rebuke#2"    → { slug: 'hellish-rebuke', source: 'phb', castLevel: 2 }
 *   "darkness"            → { slug: 'darkness', source: 'phb' }
 *   "faerie fire|xphb"   → { slug: 'faerie-fire', source: 'xphb' }
 *
 * Per REQ-I-NORM-02:
 *   - Strip `#c` (cantrip marker — unreliable, per bootstrap #599)
 *   - Strip `#N` (upcast suffix) → record as castLevel
 *   - Split on `|` for source override; default source = 'phb'
 *   - Slugify: lowercase + spaces → hyphens
 */
function parseSpellTag(tag: string): { slug: string; source: string; castLevel?: number } {
  let rest = tag;

  // Extract `|source` suffix first (before stripping #tags)
  let source = 'phb';
  const pipeIdx = rest.indexOf('|');
  if (pipeIdx !== -1) {
    source = rest.slice(pipeIdx + 1).toLowerCase();
    rest = rest.slice(0, pipeIdx);
  }

  // Strip #c cantrip marker (Decision #602 family: unreliable, ignored)
  rest = rest.replace(/#c$/i, '');

  // Extract #N upcast suffix
  let castLevel: number | undefined;
  const castMatch = rest.match(/#(\d+)$/);
  if (castMatch) {
    castLevel = parseInt(castMatch[1]!, 10);
    rest = rest.slice(0, rest.lastIndexOf('#'));
  }

  // Slugify: lowercase + trim + spaces → hyphens
  const slug = rest
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  return castLevel !== undefined ? { slug, source, castLevel } : { slug, source };
}

/**
 * Converts a string character-level key to the literal union 1|3|5.
 * Returns null when unrecognized (triggers warn+skip per REQ-I-NORM-06).
 */
function parseCharacterLevel(key: string): 1 | 3 | 5 | null {
  if (VALID_CHAR_LEVELS.has(key)) return Number(key) as 1 | 3 | 5;
  return null;
}

/**
 * Normalizes one 5etools additionalSpells block object into RaceInnateSpell entries.
 *
 * @param block - One element of the additionalSpells array (PHB races have exactly 1).
 * @param raceName - Used in warning messages.
 * @param out - Accumulator for emitted RaceInnateSpell entries.
 * @param warnings - Accumulator for diagnostic warnings.
 */
function normalizeBlock(
  block: Record<string, unknown>,
  raceName: string,
  out: RaceInnateSpell[],
  warnings: string[],
): void {
  // ---- Ability ----------------------------------------------------------------
  const ability = block['ability'];
  type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  const VALID_ABILITIES = new Set<string>(['str', 'dex', 'con', 'int', 'wis', 'cha']);
  let resolvedAbility: AbilityKey;
  if (typeof ability === 'string' && VALID_ABILITIES.has(ability)) {
    resolvedAbility = ability as AbilityKey;
  } else {
    warnings.push(
      `additionalSpells ability "${String(ability)}" unrecognized — defaulting to 'cha' (${raceName})`,
    );
    resolvedAbility = 'cha';
  }

  // ---- Bucket 1: known -------------------------------------------------------
  const known = block['known'];
  if (known && typeof known === 'object' && !Array.isArray(known)) {
    for (const [levelKey, list] of Object.entries(known as Record<string, unknown>)) {
      const level = parseCharacterLevel(levelKey);
      if (level === null) {
        warnings.push(
          `additionalSpells known level key "${levelKey}" unrecognized — skipped (${raceName})`,
        );
        continue;
      }

      if (Array.isArray(list)) {
        // Shape A or C: direct array of spell strings
        for (const tag of list) {
          if (typeof tag !== 'string') continue;
          const { slug, source, castLevel } = parseSpellTag(tag);
          const entry: RaceInnateSpell = {
            slug,
            source,
            characterLevelAvailable: level,
            frequency: 'at-will',
            ability: resolvedAbility,
          };
          if (castLevel !== undefined) entry.castLevel = castLevel;
          out.push(entry);
        }
      } else if (typeof list === 'object' && list !== null && '_' in list) {
        // Shape B: { _: [{ choose: string }] }
        const underscore = (list as Record<string, unknown>)['_'];
        if (!Array.isArray(underscore)) continue;
        for (const item of underscore) {
          if (typeof item !== 'object' || item === null) continue;
          const chooseStr = (item as Record<string, unknown>)['choose'];
          if (typeof chooseStr !== 'string') continue;

          if (chooseStr === 'level=0|class=Wizard') {
            // High Elf sentinel (decision #602)
            out.push({
              slug: '__choose__',
              source: '',
              characterLevelAvailable: level,
              frequency: 'at-will',
              ability: resolvedAbility,
              isPlayerChoice: true,
              fromClass: 'wizard',
            });
          } else {
            warnings.push(
              `additionalSpells choose shape "${chooseStr}" not recognized — skipped (${raceName})`,
            );
          }
        }
      }
    }
  }

  // ---- Bucket 2: innate -------------------------------------------------------
  const innate = block['innate'];
  if (innate && typeof innate === 'object' && !Array.isArray(innate)) {
    for (const [levelKey, freqObj] of Object.entries(innate as Record<string, unknown>)) {
      const level = parseCharacterLevel(levelKey);
      if (level === null) {
        warnings.push(
          `additionalSpells innate level key "${levelKey}" unrecognized — skipped (${raceName})`,
        );
        continue;
      }

      if (typeof freqObj !== 'object' || freqObj === null) continue;
      for (const [freqKey, freqValue] of Object.entries(freqObj as Record<string, unknown>)) {
        if (freqKey === 'daily') {
          // daily: { N: string[] }
          if (typeof freqValue !== 'object' || freqValue === null) continue;
          for (const [dailyN, dailyList] of Object.entries(freqValue as Record<string, unknown>)) {
            if (dailyN !== '1') {
              warnings.push(
                `additionalSpells daily key "${dailyN}" not "1" — normalized to daily-1 (${raceName})`,
              );
            }
            if (!Array.isArray(dailyList)) continue;
            for (const tag of dailyList) {
              if (typeof tag !== 'string') continue;
              const { slug, source, castLevel } = parseSpellTag(tag);
              const entry: RaceInnateSpell = {
                slug,
                source,
                characterLevelAvailable: level,
                frequency: 'daily-1',
                ability: resolvedAbility,
              };
              if (castLevel !== undefined) entry.castLevel = castLevel;
              out.push(entry);
            }
          }
        } else {
          warnings.push(
            `additionalSpells innate frequency "${freqKey}" not 'daily' — skipped (${raceName})`,
          );
        }
      }
    }
  }

  // ---- Bucket 3: expanded (out of scope, warn + skip) -----------------------
  if ('expanded' in block) {
    warnings.push(
      `additionalSpells.expanded not supported in Batch 6 — skipped (${raceName})`,
    );
  }
}

/**
 * Converts the raw 5etools `additionalSpells` field (typically an array of one block)
 * into a typed `RaceInnateSpell[]` array with associated warnings.
 *
 * Per REQ-I-NORM-01: handles Shape A (Tiefling/Drow), Shape B (High Elf),
 * Shape C (Forest Gnome). Unknown structures emit warnings and are skipped.
 *
 * @param rawAdditionalSpells - The raw value of `race.additionalSpells` from 5etools.
 * @param raceName - Used in warning messages for diagnostics.
 */
export function normalizeAdditionalSpells(
  rawAdditionalSpells: unknown,
  raceName: string,
): { spells: RaceInnateSpell[]; warnings: string[] } {
  if (rawAdditionalSpells === null || rawAdditionalSpells === undefined) {
    return { spells: [], warnings: [] };
  }

  const spells: RaceInnateSpell[] = [];
  const warnings: string[] = [];

  // PHB races have exactly one block; guard against multi-block (future sources).
  const blocks: unknown[] = Array.isArray(rawAdditionalSpells)
    ? rawAdditionalSpells
    : [rawAdditionalSpells];

  for (const block of blocks) {
    if (typeof block !== 'object' || block === null) continue;
    normalizeBlock(block as Record<string, unknown>, raceName, spells, warnings);
  }

  return { spells, warnings };
}
