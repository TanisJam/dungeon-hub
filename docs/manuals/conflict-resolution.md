# Manual conflict resolution

> When two enabled manuals define the "same" entity (e.g. VGM and MPMM both ship an Aasimar race), the DM picks the winner per-world via `disabledEntities`. This document explains the mechanics with worked examples.

---

## Mechanics

Each world owns a `rules_profile` (JSONB column on `worlds`, schema `packages/domain/src/rules-profile/types.ts`). Two fields drive conflict resolution:

### `sources: Record<string, boolean>`

Map of source-code → enabled. A source missing from the map (or set to `false`) is **disabled** — its rows are filtered out at query time. Default for a new world ships with PHB, XGE, TCE enabled and everything else disabled (`packages/domain/src/rules-profile/default.ts`).

### `disabledEntities: { races, subraces, classes, subclasses, backgrounds, spells, items, feats, optionalFeatures }`

Each is a `string[]` of `"slug|SOURCE"` entries (e.g. `"aasimar|VGM"`). Entries in this list are **suppressed even if their source is enabled**. This is the fine-grained override.

The two interact additively:

```
visible_to_world(entity)
  = entity.source in sources where value=true
  AND  "slug|SOURCE" NOT in disabledEntities[entityKind]
```

There is **no auto-precedence** (e.g. "MPMM always wins over VGM"). The DM declares the policy by toggling `sources` and listing `disabledEntities`. This is a locked decision for `manual-system-foundation` — auto-precedence may come in a future SDD.

### `reprintedAs` is informational, not enforcement

Every compendium row carries an optional `reprintedAs: string[]` of `"slug|SOURCE"` entries pointing at later reprints (see `docs/manuals/dsl.md` § Common shape). This is metadata — **the importer does NOT auto-disable reprinted entities**. The DM decides which version to keep using `disabledEntities`.

A future UI layer (post-MVP) may surface "this entity is reprinted in X — disable the older one?" suggestions, but as of `manual-system-foundation`, enforcement is manual.

---

## Example 1 — Aasimar: VGM vs MPMM

Both Volo's Guide to Monsters (VGM) and Mordenkainen Presents: Monsters of the Multiverse (MPMM) ship an Aasimar race. MPMM's version is the newer (post-Tasha) rewrite; VGM's is the original. The DM wants to enable both books for their general content but only have ONE Aasimar available at character creation.

**Goal**: keep MPMM Aasimar, hide VGM Aasimar.

```jsonc
{
  "sources": {
    "PHB":  true,
    "XGE":  true,
    "TCE":  true,
    "VGM":  true,   // enabled for its other content (monsters, etc.)
    "MPMM": true    // enabled — Aasimar comes from here
  },
  "disabledEntities": {
    "races": ["aasimar|VGM"],   // suppress the VGM Aasimar specifically
    "subraces": [],
    "classes": [],
    "subclasses": [],
    "backgrounds": [],
    "spells": [],
    "items": [],
    "feats": [],
    "optionalFeatures": []
  }
}
```

The reverse policy (keep VGM, hide MPMM) is symmetric: put `"aasimar|MPMM"` in `disabledEntities.races` instead.

Both `aasimar|VGM` and `aasimar|MPMM` carry `reprintedAs` metadata referencing later prints — useful for UI hints, but `disabledEntities` is what actually filters.

---

## Example 2 — Disabling a single reprinted spell

PHB ships Find Familiar; XGE reprints the same name as a tweaked variant. The DM wants only the PHB version available.

**Goal**: keep PHB Find Familiar, hide XGE Find Familiar.

```jsonc
{
  "sources": {
    "PHB": true,
    "XGE": true     // XGE remains enabled for everything else
  },
  "disabledEntities": {
    "spells": ["find-familiar|XGE"]
  }
}
```

The same pattern applies to any `(slug, source)` collision across enabled manuals: enumerate the unwanted version(s) under the matching entity kind.

---

## Notes

- **Per-entity-kind keys**: `disabledEntities` is keyed by entity kind (`races`, `spells`, etc.), not flat. A subrace lives under `subraces`, not `races`. The kind keys are the same as the `compendium_*` table suffix (see `packages/domain/src/rules-profile/types.ts:10`).
- **Slug format**: lowercase, dash-separated. Use the same slug the importer produces (`slugify(name)`). See `packages/compendium-import/src/normalize.ts:22`.
- **Source code format**: 5etools upstream code (`PHB`, `XGE`, `TCE`, `VGM`, `MPMM`, ...). NOT the long name.
- **No homebrew authoring UX in MVP**: the DM workflow for editing `rules_profile` is API-only in MVP (see `docs/mvp/definition.md` §4.8 OUT scope). Authoring UI lands post-MVP.
- **Default profile is a baseline, not a policy**: `DEFAULT_RULES_PROFILE` (PHB + XGE + TCE on; everything else off) is a sensible starting point for a new world. Any DM-driven divergence is theirs to declare.

---

## See also

- `docs/manuals/dsl.md` — what each compendium entity looks like and how `reprintedAs` is normalized.
- `packages/domain/src/rules-profile/types.ts` — `RulesProfile` schema and the `enabledSources` helper.
- `packages/domain/src/rules-profile/default.ts` — `DEFAULT_RULES_PROFILE` (the new-world baseline).
- engram `sdd/manual-system-foundation/spec` (#788) — the spec this document closes (`REQ-MSF-CONFLICT-RESOLUTION`).
