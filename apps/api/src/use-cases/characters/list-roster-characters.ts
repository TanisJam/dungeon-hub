/**
 * list-roster-characters.ts — Player roster list view.
 *
 * Powers GET /characters (the /personajes screen). Returns each row plus:
 *   - lineage: composed string ("Semielfo · Bardo (Colegio del Saber) 4")
 *     resolved via domain `formatLineage` from bulk compendium lookups.
 *   - hpCurrent / hpMax: extracted from `character.data.hp.{current,max}` JSONB
 *     (same path as the sheet endpoint at characters.ts:687).
 *
 * Approach D per SDD personajes-v3-data (engram #1022 explore): bulk compendium
 * lookup over distinct (slug, source) tuples; no schema migration.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import {
  characters,
  compendiumRaces,
  compendiumClasses,
  compendiumSubclasses,
} from '../../infra/db/schema.js';
import { formatLineage, type LineageInput } from '@dungeon-hub/domain/character/format';
import type { CharacterStatus } from '@dungeon-hub/domain/character/approval';

interface RawRaceRef {
  slug?: string;
  source?: string;
}
interface RawClassRef {
  classSlug?: string;
  source?: string;
  level?: number;
  subclassSlug?: string;
  subclassSource?: string;
}
interface RawCharacterData {
  race?: RawRaceRef;
  subrace?: RawRaceRef | null;
  classes?: RawClassRef[];
  hp?: { current?: number; max?: number };
}

export interface RosterRow {
  id: string;
  worldId: string;
  name: string;
  status: string;
  xp: number;
  createdAt: Date;
  updatedAt: Date;
  lineage: string;
  hpCurrent: number | null;
  hpMax: number | null;
}

export interface ListRosterCharactersInput {
  userId: string;
  worldId?: string;
  statusFilter?: CharacterStatus[];
}

const key = (slug: string, source: string) => `${slug}|${source}`;

export async function listRosterCharacters(
  input: ListRosterCharactersInput,
): Promise<RosterRow[]> {
  const conditions = [eq(characters.userId, input.userId)];
  if (input.worldId) conditions.push(eq(characters.worldId, input.worldId));
  if (input.statusFilter && input.statusFilter.length > 0) {
    conditions.push(inArray(characters.status, input.statusFilter));
  }
  const whereExpr = conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await db
    .select({
      id: characters.id,
      worldId: characters.worldId,
      name: characters.name,
      status: characters.status,
      data: characters.data,
      xp: characters.xp,
      createdAt: characters.createdAt,
      updatedAt: characters.updatedAt,
    })
    .from(characters)
    .where(whereExpr)
    .orderBy(characters.createdAt);

  // Collect distinct slugs per compendium table.
  const raceSlugs = new Set<string>();
  const classSlugs = new Set<string>();
  const subclassSlugs = new Set<string>();
  for (const r of rows) {
    const data = (r.data ?? {}) as RawCharacterData;
    if (data.race?.slug) raceSlugs.add(data.race.slug);
    if (data.subrace?.slug) raceSlugs.add(data.subrace.slug);
    if (Array.isArray(data.classes)) {
      for (const c of data.classes) {
        if (c.classSlug) classSlugs.add(c.classSlug);
        if (c.subclassSlug) subclassSlugs.add(c.subclassSlug);
      }
    }
  }

  // Bulk compendium fetch (each query is O(distinct slugs)).
  const [raceRows, classRows, subclassRows] = await Promise.all([
    raceSlugs.size === 0
      ? []
      : db
          .select({
            slug: compendiumRaces.slug,
            source: compendiumRaces.source,
            name: compendiumRaces.name,
          })
          .from(compendiumRaces)
          .where(inArray(compendiumRaces.slug, [...raceSlugs])),
    classSlugs.size === 0
      ? []
      : db
          .select({
            slug: compendiumClasses.slug,
            source: compendiumClasses.source,
            name: compendiumClasses.name,
          })
          .from(compendiumClasses)
          .where(inArray(compendiumClasses.slug, [...classSlugs])),
    subclassSlugs.size === 0
      ? []
      : db
          .select({
            slug: compendiumSubclasses.slug,
            source: compendiumSubclasses.source,
            name: compendiumSubclasses.name,
          })
          .from(compendiumSubclasses)
          .where(inArray(compendiumSubclasses.slug, [...subclassSlugs])),
  ]);

  const raceMap = new Map(raceRows.map((r) => [key(r.slug, r.source), r.name]));
  const classMap = new Map(classRows.map((r) => [key(r.slug, r.source), r.name]));
  const subclassMap = new Map(
    subclassRows.map((r) => [key(r.slug, r.source), r.name]),
  );

  return rows.map((r) => {
    const data = (r.data ?? {}) as RawCharacterData;

    const buildRef = (
      slug: string,
      source: string | undefined,
      lookup: Map<string, string>,
    ): { slug: string; name?: string } => {
      const name = lookup.get(key(slug, source ?? ''));
      return name !== undefined ? { slug, name } : { slug };
    };

    const race = data.race?.slug
      ? buildRef(data.race.slug, data.race.source, raceMap)
      : { slug: '' };
    const subrace = data.subrace?.slug
      ? buildRef(data.subrace.slug, data.subrace.source, raceMap)
      : null;
    const classes = (data.classes ?? [])
      .filter((c): c is RawClassRef & { classSlug: string; level: number } =>
        Boolean(c.classSlug) && typeof c.level === 'number',
      )
      .map((c) => {
        const className = classMap.get(key(c.classSlug, c.source ?? ''));
        const subclassName = c.subclassSlug
          ? subclassMap.get(key(c.subclassSlug, c.subclassSource ?? ''))
          : undefined;
        const entry: LineageInput['classes'][number] = { slug: c.classSlug, level: c.level };
        if (className !== undefined) entry.name = className;
        if (subclassName !== undefined) entry.subclassName = subclassName;
        return entry;
      });

    const lineageInput: LineageInput = subrace
      ? { race, subrace, classes }
      : { race, classes };

    return {
      id: r.id,
      worldId: r.worldId,
      name: r.name,
      status: r.status,
      xp: r.xp,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lineage: formatLineage(lineageInput),
      hpCurrent: typeof data.hp?.current === 'number' ? data.hp.current : null,
      hpMax: typeof data.hp?.max === 'number' ? data.hp.max : null,
    };
  });
}
