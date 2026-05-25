import { join } from 'node:path';
import { readJson } from '../reader.js';
import { slugify, parseReprintedAs, isExcludedSource } from '../normalize.js';
import type { FiveeToolsRace, FiveeToolsSubrace, NormalizedRace } from '../types.js';
import { expandDragonbornAncestries } from './phb-dragonborn-ancestries.js';
import { normalizeAdditionalSpells } from './normalize-additional-spells.js';

interface RacesFile {
  race?: FiveeToolsRace[];
  subrace?: FiveeToolsSubrace[];
}

/**
 * 5etools includes "metadata-only" subrace entries for some PHB races
 * (Dragonborn, Half-Elf, Half-Orc, Tiefling, Human) — entries with no `name`
 * field. Four of those carry only fluff/SRD metadata and emit visual noise like
 * "Half-Elf Variant Half-Elf" in the picker if the importer fabricates a name.
 * The fifth (Human PHB) carries the canonical +1-to-all `ability` block while
 * the base Human race row has no ability of its own.
 *
 * Returns:
 *   - 'skip' when the unnamed subrace has no mechanical content (just SRD/fluff metadata).
 *   - 'merge-ability' when the unnamed subrace has `ability` (Human PHB) — the caller
 *     lifts the ability into the matching base race row.
 *   - 'emit' for any subrace with a real `name`.
 */
export type UnnamedSubraceDisposition = 'skip' | 'merge-ability' | 'emit';

export function classifyUnnamedSubrace(s: FiveeToolsSubrace): UnnamedSubraceDisposition {
  if (s.name) return 'emit';
  if (s.ability && s.ability.length > 0) return 'merge-ability';
  return 'skip';
}

export async function importRaces(
  dataDir: string,
  warnings: string[],
): Promise<NormalizedRace[]> {
  const file = await readJson<RacesFile>(join(dataDir, 'races.json'));
  const out: NormalizedRace[] = [];

  for (const r of file.race ?? []) {
    if (isExcludedSource(r.source)) continue;
    // Normalize additionalSpells for this race and merge into data JSONB.
    // PHB scope: Tiefling base race has additionalSpells (Infernal Legacy).
    const additionalSpellsRaw = Array.isArray(r.additionalSpells)
      ? r.additionalSpells[0]
      : null;
    const raceSpellsResult = normalizeAdditionalSpells(additionalSpellsRaw ?? null, r.name);
    if (raceSpellsResult.warnings.length > 0) {
      warnings.push(...raceSpellsResult.warnings);
    }
    const raceData: Record<string, unknown> = { ...(r as unknown as Record<string, unknown>) };
    if (raceSpellsResult.spells.length > 0) {
      raceData['additionalSpellsNormalized'] = raceSpellsResult.spells;
    }

    const baseRow: NormalizedRace = {
      slug: slugify(r.name),
      source: r.source,
      name: r.name,
      data: raceData,
      reprintedAs: parseReprintedAs(r.reprintedAs),
      isSubrace: false,
      parentSlug: null,
      parentSource: null,
    };
    out.push(baseRow);

    // PHB Dragonborn: emit 10 synthetic ancestry subrace rows (PHB p.34).
    // No-op for every other race. After deploy, run `pnpm import:compendium`
    // to materialize the 10 rows in the DB.
    out.push(...expandDragonbornAncestries(baseRow));
  }

  for (const s of file.subrace ?? []) {
    if (isExcludedSource(s.source)) continue;
    if (!s.raceName || !s.raceSource) {
      warnings.push(`Subrace "${s.name ?? '?'}" (${s.source}) sin raceName/raceSource — skip`);
      continue;
    }
    // Mismo issue que con subclasses: 5etools puede duplicar subraces — una atada
    // a la raza 2014 y otra a la 2024. Excluimos las que se atan a razas 2024.
    if (isExcludedSource(s.raceSource)) continue;

    // Handle unnamed subraces (metadata-only stubs OR mechanics-carrying stubs).
    const disposition = classifyUnnamedSubrace(s);
    if (disposition === 'skip') {
      // Pure metadata-only stub (Dragonborn/Half-Elf/Half-Orc/Tiefling PHB).
      // Silently drop — no warning needed; this is expected upstream data shape.
      continue;
    }
    if (disposition === 'merge-ability') {
      // Human PHB case: ability lives on the unnamed subrace; lift it onto the base
      // race row so the base race exposes the canonical +1-to-all ASIs directly.
      const baseSlug = slugify(s.raceName);
      const baseRow = out.find(
        (r) => !r.isSubrace && r.slug === baseSlug && r.source === s.raceSource,
      );
      if (baseRow) {
        const baseData = baseRow.data as Record<string, unknown>;
        if (!baseData['ability'] && s.ability) {
          baseData['ability'] = s.ability;
        }
      } else {
        warnings.push(
          `Unnamed subrace with ability for ${s.raceName}|${s.raceSource} — base race row not found, ability lost`,
        );
      }
      continue;
    }
    // disposition === 'emit' → s.name is non-empty by classifier contract.
    const displayName = s.name as string;

    // Normalize additionalSpells for this subrace and merge into data JSONB.
    // PHB scope: Drow, High Elf, Forest Gnome subraces have additionalSpells.
    const subraceSpellsRaw = Array.isArray(s.additionalSpells)
      ? s.additionalSpells[0]
      : null;
    const subraceSpellsResult = normalizeAdditionalSpells(subraceSpellsRaw ?? null, displayName);
    if (subraceSpellsResult.warnings.length > 0) {
      warnings.push(...subraceSpellsResult.warnings);
    }
    const subraceData: Record<string, unknown> = { ...(s as unknown as Record<string, unknown>) };
    if (subraceSpellsResult.spells.length > 0) {
      subraceData['additionalSpellsNormalized'] = subraceSpellsResult.spells;
    }

    out.push({
      slug: `${slugify(s.raceName)}--${slugify(displayName)}`,
      source: s.source,
      name: displayName,
      data: subraceData,
      reprintedAs: parseReprintedAs(s.reprintedAs),
      isSubrace: true,
      parentSlug: slugify(s.raceName),
      parentSource: s.raceSource,
    });
  }

  return out;
}
