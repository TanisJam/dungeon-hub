# @dungeon-hub/compendium-import

Boundary between 5etools JSON packs and the `compendium_*` tables. **The importer is the only thing in the codebase that touches the raw 5etools files** — everything else (api, web, domain) consumes the normalized records this package emits.

## Quickstart

### Import the bundled 5etools pack into your DB

The repo ships with the 5etools dataset at `data/5etools/data/`. To load it into your local Supabase Postgres:

```bash
# from repo root, with Supabase running
pnpm --filter @dungeon-hub/api import:5etools
```

That script runs `parseAll(dataDir)` and upserts every entity by `(slug, source)`. **Idempotent** — re-running upserts in place; safe on a populated DB.

Optional flag: `--dataDir=/absolute/path` to import from a different folder.

### Run the tests

```bash
pnpm --filter @dungeon-hub/compendium-import test
```

The seed-pack smoke test (`seed-pack.smoke.test.ts`) loads the bundled data and asserts counts + a handful of known rows survive normalization. Unit tests cover the trickier importers (races `_copy`/`_versions`, additional spells normalizer, dragonborn ancestries).

---

## What the importer does

For each entity type (races, classes, subclasses, backgrounds, spells, items, feats, optional features, monsters, conditions, languages, actions), the importer:

1. **Reads** the raw 5etools JSON files from `<dataDir>/<entity>/`.
2. **Filters** out excluded sources (see below).
3. **Resolves** in-pack patterns: `_copy` (race row inherits from another with `_mod` operations), `_versions` (variants like Aasimar MPMM or Dragonborn FTD).
4. **Patches** known upstream bugs at import time and emits a `warnings[]` so the operator can see them.
5. **Normalizes** to the row shape consumed by domain code.
6. **Dedups** by `(slug, source)` — first wins; collisions get a warning.

The output is `ImportResult` (see `src/types.ts`) — a record of arrays per entity plus a `warnings: string[]`.

### Excluded sources

Filtered upstream of normalization (see `src/normalize.ts:isExcludedSource`):

- 2024-era: `XPHB`, `XDMG`, `XMM`, `XPsiHB`.
- Playtest / UA: any source starting with `UA` (e.g. `UAArtificer`).

If a future SDD expands MVP scope to include any of these, lift the filter in `normalize.ts` AND update CLAUDE.md §10.

### PHB-wins policy

When 5etools JSON disagrees with the PHB rulebook, **PHB wins**. The importer patches the discrepancy in-place and emits a warning. Examples:

- Dragonborn ancestries: 5etools encodes via `resist: [{choose:{from:[...]}}]`; importer materializes the 5 PHB ancestries (Black, Blue, Brass, Bronze, Copper, etc.) as proper subrace-like records.
- Background fluff: importer joins multi-paragraph text correctly when 5etools splits it.
- Subclass grants for cantrips (e.g. Cleric Knowledge Domain): importer normalizes the `additionalSpells` shape into the structured grant our domain expects.

See `CLAUDE.md §10` for the full house-rules log.

---

## Public API

```ts
import { parseAll, type ImportResult } from '@dungeon-hub/compendium-import';

const result: ImportResult = await parseAll('/abs/path/to/data');
// result.races, result.classes, result.subclasses, ...
// result.warnings — operator-visible advisories
```

Also exported:

```ts
import { slugify, parseReprintedAs, isExcludedSource } from '@dungeon-hub/compendium-import';
```

- `slugify(name: string)` — canonical slug derivation (kebab-case, ASCII fold, source-agnostic).
- `parseReprintedAs` — handles the 5etools `reprintedAs` pointer chain.
- `isExcludedSource(src: string)` — the filter mentioned above.

The package is pure: no DB, no IO beyond reading the JSON pack. The api script wraps it with a Drizzle batch upsert.

---

## Authoring a homebrew pack

If you want to ship your own JSON pack instead of (or alongside) the 5etools dataset:

1. **Target the shape documented in [`docs/manuals/dsl.md`](../../docs/manuals/dsl.md)** — that doc is normative for the importer's input. It lists every entity type with field-by-field requirements.
2. Place your files under a sibling directory layout (`races/`, `classes/`, etc.) inside a `dataDir` of your choosing.
3. Pick a `source` tag for your pack (e.g. `MYBREW`). Don't reuse `PHB` or other canonical 5etools tags — patches assume PHB shape.
4. Run `pnpm --filter @dungeon-hub/api import:5etools -- --dataDir=/abs/path/to/your/pack`.
5. Verify in Supabase Studio that your rows landed with `source = 'MYBREW'`.

### House-rules vs. homebrew

- **Homebrew content** = new rows in a new source. Composes with PHB via `rules_profile.sources`.
- **House rules** = intentional divergence from PHB on existing rows. Document in CLAUDE.md §10. The importer is NOT the place to encode house rules — those belong in domain or in the world's `rules_profile.disabledEntities`.

See [`docs/manuals/conflict-resolution.md`](../../docs/manuals/conflict-resolution.md) for how `rules_profile.sources` + `disabledEntities` resolve cross-manual overlaps per world, with worked examples.

---

## File layout

```
packages/compendium-import/src/
├── index.ts              # parseAll entry point + dedup
├── normalize.ts          # slugify, isExcludedSource, parseReprintedAs
├── reader.ts             # file IO helpers (assertDataDir, etc.)
├── types.ts              # ImportResult + per-entity Row types
├── importers/
│   ├── races.ts          # _copy + _versions resolution
│   ├── classes.ts        # classes + subclasses (couples them)
│   ├── backgrounds.ts
│   ├── spells.ts
│   ├── items.ts
│   ├── feats.ts
│   ├── optional-features.ts
│   ├── monsters.ts
│   ├── conditions.ts
│   ├── languages.ts
│   ├── actions.ts
│   ├── normalize-additional-spells.ts
│   └── phb-dragonborn-ancestries.ts
└── seed-pack.smoke.test.ts
```

Tests are colocated (`*.test.ts`) so the importer for a given entity and its tests live next to each other.

---

## When NOT to touch this package

- Adding a NEW class/race/spell? That's compendium DATA — add a JSON row to the 5etools pack (or your homebrew pack) and re-run the import.
- Encoding a NEW house rule? That belongs in domain (`packages/domain`), not in the importer.
- Renaming a slug to fix a typo? Almost never the right move — slugs are stable IDs that characters reference. Patch at import time only if PHB demands it.

When in doubt, surface the question instead of patching here. The importer is intentionally a thin transformation layer.
