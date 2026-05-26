# Manual DSL — what dungeon-hub consumes from a manual JSON pack

> **Status**: normative for the dungeon-hub compendium. Last reviewed 2026-05-26.
> **Source-of-truth scope**: this document describes the shape **the importer in `packages/compendium-import` consumes**. It is NOT a guarantee about upstream 5etools JSON. See § Scope.

---

## Scope

dungeon-hub imports manual data from JSON packs (today: the 5etools dataset at `data/5etools/data/`). Each pack contributes rows tagged by `source` (e.g. `PHB`, `XGE`, `TCE`) to the `compendium_*` tables.

**The importer is the boundary.** Upstream 5etools may change shape, add fields, or fix bugs. dungeon-hub's contract is with the **normalized output** of `parseAll(dataDir)` — not with the raw JSON files. If you author a homebrew pack, you target the shape this doc describes; the importer is the only thing that touches the raw files.

Two practical consequences:

1. **Patches happen at import time, not at runtime.** Domain code (`packages/domain`) only ever sees normalized records. PHB precedence wars (per `CLAUDE.md §1.1`) are resolved in the importer.
2. **Authoring a homebrew pack** means producing JSON that the existing importer files in `packages/compendium-import/src/importers/` can read. The DSL is implicit in what those importers consume — this doc makes it explicit.

Excluded sources are filtered upstream of normalization. See `packages/compendium-import/src/normalize.ts` (`isExcludedSource`):

- 2024-era: `XPHB`, `XDMG`, `XMM`, `XPsiHB`.
- Playtest / UA: any source starting with `UA` (e.g. `UAArtificer`).

---

## Common shape — every entity

Every compendium row has:

| Field | Type | Source | Description |
|---|---|---|---|
| `slug` | string | derived | `slugify(name)` — lowercase, dash-separated, accents stripped. See `normalize.ts:22`. |
| `source` | string | upstream | 5etools source code (`PHB`, `XGE`, `TCE`, ...). |
| `name` | string | upstream | Display name as it appears in 5etools. |
| `data` | unknown (JSONB) | upstream | Full original 5etools payload, kept verbatim for forward-compat. |
| `reprintedAs` | `string[] \| null` | derived | Normalized as `"slug|SOURCE"` entries. See `normalize.ts:43` (`parseReprintedAs`). Two upstream formats: bare string `"Name|Source"` or object `{ uid: "Name|Source", tag: "..." }` (the latter when the reprint changes entity kind). |

Natural key is `(slug, source)`. UNIQUE index on every `compendium_*` table.

**Deduplication**: `dedup()` in `packages/compendium-import/src/index.ts:22` keeps the first record on `(slug, source)` collision and emits a warning. Authors should not depend on collision behavior.

---

## Entities

### 1. Races (`compendium_races`)

**Importer**: `src/importers/races.ts`. **5etools file**: `races.json`.

| Field | Type | Notes |
|---|---|---|
| Common shape | — | `(slug, source, name, data, reprintedAs)`. |
| `isSubrace` | boolean | `false` for race entries; `true` for subrace entries (which also live in this table). |
| `parentSlug` | string \| null | Set for subraces — the parent race slug. |
| `parentSource` | string \| null | Set for subraces — the parent race source. |

**Patches at import time**:

- **PHB Dragonborn ancestries**: PHB Dragonborn does NOT use `_versions`. It encodes draconic ancestry as `resist: [{ choose: { from: [...] } }]` + a narrative table. The importer surfaces this as a synthetic choose-list. See `src/importers/phb-dragonborn-ancestries.ts` and engram #558.
- **Unnamed subrace stubs**: 5etools includes metadata-only subrace entries with no `name` (e.g. PHB Half-Elf / Half-Orc / Tiefling). The importer classifies via `classifyUnnamedSubrace`: emit when the stub carries mechanical content (Human PHB +1-to-all), skip when it's pure fluff metadata. See `src/importers/races.ts:29`.
- **`_copy` materialization**: a race row may declare `_copy: { name, source, _mod: {...} }`. The importer resolves these at import time into a full row. See engram (pre-`rules-audit-backgrounds` bootstrap notes).
- **`_versions`**: two upstream variants — SIMPLE (Aasimar MPMM and ~15 others) and ABSTRACT+IMPL (XPHB Dragonborn, FTD Chromatic/Gem/Metallic). XPHB + FTD are excluded sources for this project; PHB Dragonborn does NOT use `_versions`. See engram #558.

---

### 2. Classes (`compendium_classes`)

**Importer**: `src/importers/classes.ts` (`importClassesAndSubclasses`). **5etools dir**: `class/`.

Common shape only. The full class payload (HD, proficiency, classFeatures, etc.) lives in `data`. Subclasses ship in the same JSON file but go to a separate table (next entity).

**Patches**: none specific at this layer; class JSON is consumed as-is. The class+subclass split happens at parse time.

---

### 3. Subclasses (`compendium_subclasses`)

**Importer**: `src/importers/classes.ts` (sibling output of `importClassesAndSubclasses`).

| Field | Type | Notes |
|---|---|---|
| Common shape | — | — |
| `classSlug` | string | Parent class slug (e.g. `wizard`). |
| `classSource` | string | Parent class source (e.g. `PHB`). |

Slug format observed in practice: `{classSlug}--{shortName}` (double-dash), e.g. `wizard--abjuration`, `bard--glamour`, `artificer--alchemist`.

**Note on `(classSlug, classSource)` vs `(source)`**: a subclass FROM `XGE` can belong to a class FROM `PHB`. E.g. Bard College of Glamour: `source=XGE, classSlug=bard, classSource=PHB`. This is normal and important for cross-source manuals.

---

### 4. Backgrounds (`compendium_backgrounds`)

**Importer**: `src/importers/backgrounds.ts`. **5etools file**: `backgrounds.json`.

Common shape only. Skill / language / tool proficiencies and entries live in `data`.

**Patches**: see `_copy` bootstrap notes (engram pre-`rules-audit-backgrounds`). The Custom Background patch (`skillToolLanguageProficiencies.anyTool:1` → `2` per PHB p.125) is applied in the **domain** layer at runtime, not at import — the importer just emits a WARNING.

---

### 5. Spells (`compendium_spells`)

**Importer**: `src/importers/spells.ts`. **5etools dir**: `spells/`.

| Field | Type | Notes |
|---|---|---|
| Common shape | — | — |
| `level` | integer | 0 = cantrip. |
| `school` | string | 5etools code: `A` (abjuration), `C` (conjuration), `D` (divination), `E` (enchantment), `I` (illusion), `N` (necromancy), `T` (transmutation), `V` (evocation). |
| `classes` | string[] | BASE class slugs that have the spell on their canonical class spell list (PHB Appendix B). Does NOT include subclasses that grant the spell as a bonus. |
| `subclassGrants` | SubclassGrant[] | Subclasses that grant the spell as bonus/extra. Shape: `{ classSlug, classSource, subclassSlug, subclassSource, subclassName }`. |
| `ritual` | boolean | `meta.ritual === true` (PHB p.201–202). |
| `concentration` | boolean | Any `duration[].concentration === true` (PHB p.203). |
| `componentsM` | boolean | Material component present (PHB p.203). |
| `componentsMCost` | number \| null | Cost in copper pieces when upstream provides it. |

**Patches**:

- **Additional spells normalizer** (`src/importers/normalize-additional-spells.ts`): 5etools `additionalSpells` field on race/subrace has three upstream shapes (A: simple list, B: keyed-by-key, C: nested with `choose`). The normalizer flattens to a uniform shape. Tests in `normalize-additional-spells.test.ts`.
- **Subclass grants** (`subclassGrants`): scanned at import time from subclass feature definitions; this is NOT a field on the raw spell. See `src/importers/spells-meta.ts`.

---

### 6. Feats (`compendium_feats`)

**Importer**: `src/importers/feats.ts`. **5etools file**: `feats.json`.

| Field | Type | Notes |
|---|---|---|
| Common shape | — | — |
| `prerequisites` | unknown \| null | Raw `prerequisite` array from 5etools, preserved. Domain validation lives in `packages/domain/src/character/feat/validate.ts`. |

**Patches**: none at import time. Validation patterns (e.g. ability prereq check) are in the domain layer using `rulesProfile`.

---

### 7. Items (`compendium_items`)

**Importer**: `src/importers/items.ts`. **5etools files**: `items.json` + `items-base.json` (base item types).

| Field | Type | Notes |
|---|---|---|
| Common shape | — | — |
| `type` | string \| null | 5etools type code (e.g. `M` for melee weapon, `R` for ranged, `LA`/`MA`/`HA` for armor, `S` for shield). |
| `weight` | string \| null | Numeric stored as string to preserve precision. |

**Patches**: items derive base properties from `items-base.json` when the entry only references a base type. The full payload is in `data`.

---

### 8. Languages (`compendium_languages`)

**Importer**: `src/importers/languages.ts`. **5etools file**: `languages.json`.

| Field | Type | Notes |
|---|---|---|
| Common shape | — | — |
| `type` | string \| null | `'standard'`, `'exotic'`, `'secret'`, or null. |
| `script` | string \| null | Display script (e.g. `Dwarvish`, `Common`). |

**Patches**: none. Standard/exotic pools in domain (`packages/domain/src/character/language/pools.ts`) are still hardcoded — tracked by SDD `domain-reference-data-runtime-source` (#513).

---

### 9. Optional Features (`compendium_optional_features`)

**Importer**: `src/importers/optional-features.ts`. **5etools file**: `optionalfeatures.json`.

| Field | Type | Notes |
|---|---|---|
| Common shape | — | — |
| `featureType` | string[] | 5etools feature-type codes (e.g. `EI` Eldritch Invocation, `MM` Metamagic, `FS` Fighting Style, `BF` Bard Bardic). |
| `prerequisites` | unknown \| null | Raw `prerequisite` array preserved. |

**Patches**: TCE Optional Class Features (ignored at this layer — the domain consumes them when the world enables `rulesProfile.variantRules.tashasOptionalClassFeatures`).

---

### 10. Actions (`compendium_actions`)

**Importer**: `src/importers/actions.ts`. **5etools file**: `actions.json`.

Common shape only. Used for the in-game action reference UI; no derived fields.

---

### 11. Conditions (`compendium_conditions`)

**Importer**: `src/importers/conditions.ts`. **5etools file**: `conditionsdiseases.json`.

| Field | Type | Notes |
|---|---|---|
| Common shape | — | — |
| `kind` | `'condition' \| 'status'` | 5etools groups status conditions (e.g. Exhaustion levels) alongside the standard PHB Appendix A conditions. |

---

## Patches index — quick reference

| Patch | File | Reason |
|---|---|---|
| PHB Dragonborn ancestries | `src/importers/phb-dragonborn-ancestries.ts` | PHB Dragonborn doesn't use `_versions`; ancestry is encoded as `resist + choose`. |
| Unnamed subrace classifier | `src/importers/races.ts:29` (`classifyUnnamedSubrace`) | PHB metadata-only subrace stubs vs Human-style mechanical stubs. |
| `_copy` materialization | importers as needed | 5etools `_copy: { _mod }` resolved at parse time. |
| `_versions` SIMPLE/ABSTRACT | importers as needed | Two upstream variants; XPHB+FTD excluded. See engram #558. |
| Additional spells normalizer | `src/importers/normalize-additional-spells.ts` | Three upstream shapes A/B/C flattened. |
| Subclass grants extractor | `src/importers/spells-meta.ts` | Bonus-spell grants live in subclass features, not on the spell. |
| Reprinted-as normalizer | `src/normalize.ts:43` (`parseReprintedAs`) | Two upstream formats flattened to `slug\|SOURCE`. |
| Excluded sources filter | `src/normalize.ts:14` (`isExcludedSource`) | 2024-era + UA never imported. |

---

## See also

- `docs/manuals/conflict-resolution.md` — how `disabledEntities` resolves cross-manual overlaps.
- `CLAUDE.md §1.1` — PHB precedence policy.
- `CLAUDE.md §10` — 5etools data handling gotchas.
- engram `mvp/modular-manual-system` (#765) — the architectural pivot that promoted this DSL to critical path.
- engram `sdd/manual-system-foundation/spec` (#788) — the spec these docs close.
