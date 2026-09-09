/**
 * Per-world homebrew compendium source code.
 *
 * Custom content via JSON upload (MVP #3.8, DEC-1 locked 2026-06-04: JSON
 * upload, not visual authoring — see docs/mvp/definition.md). Compendium
 * tables are GLOBAL, not world-scoped, keyed by the unique index
 * (slug, source) (apps/api/src/infra/db/schema.ts). That forces homebrew's
 * "source" to be a normal source code the DM's world opts into via
 * `rulesProfile.sources` (docs/manuals/conflict-resolution.md) — there is
 * no per-world compendium table to put homebrew in instead.
 *
 * A single shared "HB" code would break under that model: two DMs
 * homebrewing the same-named item (e.g. "Blade of Dawn") slugify to the
 * same (slug, source) row — a collision on the unique index, or worse, one
 * DM's re-upload silently overwriting another's item. And enabling "HB" in
 * one world would make every other world's homebrew visible too, since
 * `sources` gates by code, not by owner. Deriving the code from the
 * worldId makes both impossible: each world writes to its own source, so
 * two worlds can never collide and enabling one world's code can never
 * leak another's content.
 */
export function homebrewSourceCode(worldId: string): string {
  const hex = worldId.replace(/-/g, '').slice(0, 8);
  return `HB-${hex}`;
}
