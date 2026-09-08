/**
 * Use-case: character JSON re-import (inverse of GET /characters/:id/export).
 *
 * Resolves every compendium reference the imported envelope carries against
 * the target world's compendium tables — batched per entity table, never per
 * reference — then persists the character. Any reference that does not
 * resolve fails the whole import (400 UNRESOLVED_REFS at the route), naming
 * every offending reference, not just the first.
 *
 * MVP §3.9 — character re-import. See POST /characters/import
 * (apps/api/src/http/routes/characters.ts) for the route-level contract and
 * the world-membership / status privilege-boundary rationale.
 */
import { inArray } from 'drizzle-orm';
import type { CharacterImportEnvelope, CompendiumRef } from '@dungeon-hub/domain/character/import';
import { db } from '../../infra/db/client.js';
import {
  characters,
  compendiumRaces,
  compendiumClasses,
  compendiumSubclasses,
  compendiumBackgrounds,
  compendiumSpells,
  compendiumItems,
} from '../../infra/db/schema.js';

function bySlugSource(rows: Array<{ slug: string; source: string }>): Set<string> {
  return new Set(rows.map((r) => `${r.slug}|${r.source}`));
}

function slugsOf(refs: CompendiumRef[], kinds: CompendiumRef['kind'][]): string[] {
  return Array.from(new Set(refs.filter((r) => kinds.includes(r.kind)).map((r) => r.slug)));
}

/**
 * Resolves `refs` against their respective compendium tables and returns the
 * subset that does NOT exist in the target database. One query per table
 * touched (race + subrace share `compendium_races`, so at most 6 queries
 * total regardless of how many references were extracted).
 */
export async function findUnresolvedRefs(refs: CompendiumRef[]): Promise<CompendiumRef[]> {
  if (refs.length === 0) return [];

  const raceSlugs = slugsOf(refs, ['race', 'subrace']);
  const classSlugs = slugsOf(refs, ['class']);
  const subclassSlugs = slugsOf(refs, ['subclass']);
  const backgroundSlugs = slugsOf(refs, ['background']);
  const spellSlugs = slugsOf(refs, ['spell']);
  const itemSlugs = slugsOf(refs, ['item']);

  const [raceRows, classRows, subclassRows, backgroundRows, spellRows, itemRows] = await Promise.all([
    raceSlugs.length === 0
      ? []
      : db
          .select({ slug: compendiumRaces.slug, source: compendiumRaces.source })
          .from(compendiumRaces)
          .where(inArray(compendiumRaces.slug, raceSlugs)),
    classSlugs.length === 0
      ? []
      : db
          .select({ slug: compendiumClasses.slug, source: compendiumClasses.source })
          .from(compendiumClasses)
          .where(inArray(compendiumClasses.slug, classSlugs)),
    subclassSlugs.length === 0
      ? []
      : db
          .select({ slug: compendiumSubclasses.slug, source: compendiumSubclasses.source })
          .from(compendiumSubclasses)
          .where(inArray(compendiumSubclasses.slug, subclassSlugs)),
    backgroundSlugs.length === 0
      ? []
      : db
          .select({ slug: compendiumBackgrounds.slug, source: compendiumBackgrounds.source })
          .from(compendiumBackgrounds)
          .where(inArray(compendiumBackgrounds.slug, backgroundSlugs)),
    spellSlugs.length === 0
      ? []
      : db
          .select({ slug: compendiumSpells.slug, source: compendiumSpells.source })
          .from(compendiumSpells)
          .where(inArray(compendiumSpells.slug, spellSlugs)),
    itemSlugs.length === 0
      ? []
      : db
          .select({ slug: compendiumItems.slug, source: compendiumItems.source })
          .from(compendiumItems)
          .where(inArray(compendiumItems.slug, itemSlugs)),
  ]);

  const found = bySlugSource([
    ...raceRows,
    ...classRows,
    ...subclassRows,
    ...backgroundRows,
    ...spellRows,
    ...itemRows,
  ]);

  return refs.filter((ref) => !found.has(`${ref.slug}|${ref.source}`));
}

export interface ImportCharacterInput {
  userId: string;
  worldId: string;
  envelope: CharacterImportEnvelope;
  refs: CompendiumRef[];
}

export type ImportCharacterResult =
  | { ok: true; character: typeof characters.$inferSelect }
  | { ok: false; issues: CompendiumRef[] };

export async function importCharacter(input: ImportCharacterInput): Promise<ImportCharacterResult> {
  const unresolved = await findUnresolvedRefs(input.refs);
  if (unresolved.length > 0) {
    return { ok: false, issues: unresolved };
  }

  const { envelope, worldId, userId } = input;

  const [created] = await db
    .insert(characters)
    .values({
      userId,
      worldId,
      name: envelope.character.name,
      // Privilege boundary (MVP §3.9 decision #1): imported characters ALWAYS
      // land as 'draft', whatever status the envelope claims. Honouring an
      // exported 'active' would let anyone hand-edit exported JSON to bypass
      // the DM approval gate (draft → pending_approval → active — see
      // packages/domain/src/character/approval/state-machine.ts).
      status: 'draft',
      xp: envelope.character.xp,
      data: envelope.character.data,
      inventory: envelope.character.inventory,
      // `id` intentionally omitted — the DB always mints a fresh one.
      // envelope.character.id is NEVER reused: it would collide on re-import
      // into the same database and could let one export target another
      // user's existing row.
    })
    .returning();

  if (!created) {
    throw new Error('Insert returned no rows');
  }

  return { ok: true, character: created };
}
