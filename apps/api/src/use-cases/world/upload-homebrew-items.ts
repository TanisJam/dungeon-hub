import { and, eq, inArray, sql } from 'drizzle-orm';
import { homebrewSourceCode } from '@dungeon-hub/domain/homebrew';
import { slugify } from '@dungeon-hub/compendium-import/slugify';
import { db } from '../../infra/db/client.js';
import { compendiumItems, worlds } from '../../infra/db/schema.js';
import { loadWorldById } from '../campaigns/load-campaign.js';

export interface HomebrewItemInput {
  name: string;
  // `| undefined` (not just `?:`) because the caller's Zod `.optional()`
  // fields infer as `T | undefined`, and exactOptionalPropertyTypes:true
  // (CLAUDE.md §4) distinguishes "absent" from "present but undefined".
  type?: string | undefined;
  weight?: number | undefined;
  data?: Record<string, unknown> | undefined;
}

export interface DuplicateSlugIssue {
  code: 'DUPLICATE_SLUG';
  slug: string;
  names: string[];
  message: string;
}

export type UploadHomebrewItemsResult =
  | { ok: true; source: string; created: number; updated: number }
  | { ok: false; issues: DuplicateSlugIssue[] };

/**
 * Custom content via JSON upload — items only, the basic slice of MVP #3.8
 * (DEC-1 locked 2026-06-04: JSON upload, not visual authoring).
 *
 * See `homebrewSourceCode` (@dungeon-hub/domain/homebrew) for why the
 * compendium `source` is derived per-world instead of a single shared
 * "HB" code — that's the load-bearing decision this use-case builds on.
 */
export async function uploadHomebrewItems(
  worldId: string,
  items: HomebrewItemInput[],
): Promise<UploadHomebrewItemsResult> {
  const source = homebrewSourceCode(worldId);

  // Two items whose names slugify identically inside ONE upload is a DM
  // authoring mistake (e.g. "Blade of Dawn" vs "Blade of Dawn!") — reject
  // it as a validation error up front rather than letting the second
  // silently overwrite the first once they collide in the upsert below.
  const namesBySlug = new Map<string, string[]>();
  for (const item of items) {
    const slug = slugify(item.name);
    const names = namesBySlug.get(slug) ?? [];
    names.push(item.name);
    namesBySlug.set(slug, names);
  }
  const issues: DuplicateSlugIssue[] = [];
  for (const [slug, names] of namesBySlug) {
    if (names.length > 1) {
      issues.push({
        code: 'DUPLICATE_SLUG',
        slug,
        names,
        message: `Varios items generan el mismo slug "${slug}": ${names.join(', ')}`,
      });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const slugs = [...namesBySlug.keys()];

  // Count created vs. updated BEFORE the upsert. Postgres' INSERT ... ON
  // CONFLICT doesn't report per-row which branch fired without the xmax
  // trick, and a plain pre-check is simpler and cheap at the ≤200-item cap.
  const existing = await db
    .select({ slug: compendiumItems.slug })
    .from(compendiumItems)
    .where(and(eq(compendiumItems.source, source), inArray(compendiumItems.slug, slugs)));
  const existingSlugs = new Set(existing.map((r) => r.slug));

  // Re-uploading the same slug UPDATES the row instead of failing on the
  // unique (slug, source) index — a DM fixing a typo shouldn't have to
  // delete the old row first. onConflictDoUpdate mirrors the exact pattern
  // scripts/import-5etools.ts already uses for this table.
  await db
    .insert(compendiumItems)
    .values(
      items.map((item) => ({
        slug: slugify(item.name),
        source,
        name: item.name,
        type: item.type ?? null,
        weight: item.weight !== undefined ? String(item.weight) : null,
        data: item.data ?? {},
      })),
    )
    .onConflictDoUpdate({
      target: [compendiumItems.slug, compendiumItems.source],
      set: {
        name: sql.raw('excluded.name'),
        type: sql.raw('excluded.type'),
        weight: sql.raw('excluded.weight'),
        data: sql.raw('excluded.data'),
      },
    });

  // A DM who uploads homebrew and then sees nothing because its source
  // isn't enabled is the worst possible first experience — ensure it here.
  // Partial-update style matches worlds.ts's shop-listings PATCH.
  const world = await loadWorldById(worldId);
  if (world && world.rulesProfile.sources[source] !== true) {
    const rulesProfile = {
      ...world.rulesProfile,
      sources: { ...world.rulesProfile.sources, [source]: true },
    };
    await db
      .update(worlds)
      .set({ rulesProfile, updatedAt: new Date() })
      .where(eq(worlds.id, worldId));
  }

  return {
    ok: true,
    source,
    created: slugs.length - existingSlugs.size,
    updated: existingSlugs.size,
  };
}
