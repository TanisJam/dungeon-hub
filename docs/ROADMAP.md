# dungeon-hub — Arc Index + Remaining MVP Work

> Status: living. Arc index + remaining MVP work. Update at each SDD archive.
> Ground truth for current state: `docs/STATUS.md` + engram `mvp/gap-audit-2026-06-04` (#1809).

---

## Section 1 — Remaining Work to MVP (prioritized)

Derived from gap-audit #1809 and `definition.md §7`. The MVP is not shippable until all 10 items in `definition.md §3` are ✅.

| Priority | Arc / Work | 1-line scope | Closes definition.md item |
|---|---|---|---|
| 1 | **JSON import/export (remaining)** | Character EXPORT ✅ shipped. Remaining: character RE-IMPORT (reuses the `schemaVersion:1` envelope; aligns slug algorithms first — see follow-up), then config/NPC/world export. Referential integrity on re-import is the hard part. | #3.9 Import/export |
| 2 | **West Marches write-path** (`wm-knowledge-layer`, paused at #1808) | Player contribution to Bitácora: sightings, rumors, waypoints, session recaps. Sealing/debunking by DM. Bitácora→codex link. `NovedadesFeed` backend hookup. | #3.10 WM knowledge |
| 3 | **Custom content via JSON upload** (DEC-1, locked 2026-06-04) | DM-accessible import surface: upload a JSON pack, enable per-world via `rulesProfile`. Reuses existing `compendium-import` pipeline. Visual authoring is post-MVP. | #3.8 Custom content |
| 4 | **Codex cross-category search + item type filter** | Landing-page search across all categories; items `?type=` filter in browser UI (API param already exists). | #3.4 Codex nav/search |
| 5 | **Map mobile zoom buttons + waypoint visibility model** | Explicitly enable `zoomControl` (or add custom +/– buttons) on CRS.Simple map. Lock down shared-vs-private waypoint visibility design. | #3.5 Map |

> ✅ **Campaign invite flow** (gap #782, was P1) — SHIPPED 2026-06-05 via SDD `campaign-invite-flow` (engram archive #1877). Invite-link mechanism (`campaign_invite_tokens` + `POST /campaigns/:id/invite` + `/invites/status|confirm` + `/invite/[token]` accept screen, atomic `worldMembers`+`campaignMembers` dual-write). Closes #3.6 DM campaigns.
>
> ✅ **Character JSON export** (MVP #3.9 first slice) — SHIPPED 2026-06-05 via SDD `character-json-export` (engram archive #1885). `GET /characters/:id/export` (owner-only) → versioned envelope `{schemaVersion:1, …, character:{…, data, inventory}}` (raw passthrough, no response schema) + sheet danger-zone download island. Follow-up before re-import: align the web (NFD) vs api (drop-non-ASCII) slug algorithms.
>
> ✅ **Feats + Conditions compendium browser** (MVP #3.3) — SHIPPED 2026-06-05, direct web wiring (no SDD; API+DB already existed). Two `CATEGORY_CONFIG` entries + `FeatRowView`/`ConditionRowView` + `FeatHeader`/`ConditionHeader` + two grid cards (`Dotes`/`Estados`) + landing counts. Browser route/list/detail were already generic (ADR-2 open/closed seam), so zero changes to route, list island, detail sheet, or actions. Feats surface prerequisite (PHB p.165); conditions surface condition-vs-status kind (PHB p.290). Closes #3.3.
>
> ✅ **Quests** (MVP #3.7 world content) — SHIPPED 2026-06-05 via SDD `quests` (engram archive #1895). World-scoped CRUD cloning the `journal_entries` stack: `quests` table + migration `0038` (status/visibility = text+CHECK), `GET/POST /worlds/:worldId/quests` + `GET/PATCH/DELETE /quests/:questId` (GM-only write, members read public, `dmNotes` stripped per-field server-side via `projectQuestForAccess`), `/codex/quests` page + components + codex SubNav tab, and `/inicio` DM dashboard wiring (live `QuestsSinTocarList` + `pendingQuests` count). 15 integration tests + 12 component tests. No `packages/domain` change (pure CRUD content). Deferred post-MVP: `giverNpcId`, `hexId`, `reward`, `tags`. Closes #3.7.

---

## Section 2 — Shipped Arcs Index

All archived SDD changes, ordered by archive date. For full artifact content: `mem_get_observation(<id>)` in engram.

### Pre-MVP Roadmap close (before 2026-05-26)

| Arc | Engram archive ID | MVP area served | Archive date |
|---|---|---|---|
| `compendium-entries-renderer` | #436 | #3.3/#3.4 codex browser foundation | 2026-05-23 |
| `background-custom-mixed-pool` | — (session #520) | #3.1 character builder | ~2026-05-24 |

### MVP Roadmap close (2026-05-26 sprint)

| Arc | Engram archive ID | MVP area served | Archive date |
|---|---|---|---|
| `worlds-foundation` | #785 | #3.6 campaigns, #3.7 world content, multi-DM | 2026-05-26 |
| `manual-system-foundation` | #794 | #3.8 custom content (server enforcement) | 2026-05-26 |
| `domain-reference-data-runtime-source` | #810 | #3.1/#3.8 DB as runtime SoT (#513) | 2026-05-26 |
| `character-wizard-world-rebind` | #803 | #3.1 builder regression fix | 2026-05-26 |
| `rest-closeout` | #830 | #3.2 sheet (REST-03 + REST-04) | 2026-05-26 |
| `character-approval-flow` | #838 | #3.1 builder (approval flow) | 2026-05-26 |
| `inventory-foundation` | #854 | #3.2 sheet (AC, encumbrance, inventory D1-D3) | 2026-05-26 |
| `dm-session-panel` | #863 | #3.6/#3.7 DM panel F1/F2/F4 | 2026-05-26 |
| `dm-session-grants` | #874 | #3.6 DM grants (XP/gold/item) F3 | 2026-05-26 |
| `multiclass-class-step` | #885 | #3.1 builder (multiclass) | 2026-05-26 |
| `inventory-d4-d6` | #897 | #3.2 sheet (item grant, coin weight, cost) | 2026-05-26 |
| `bot-character-read` | #906 | bot `/mi-hoja` | 2026-05-26 |
| `mobile-qa-sweep` | #915 | cross-cutting mobile E2E | 2026-05-26 |
| `rules-audit-class-features` | #819 | #3.2 sheet (class resources R-07 foundation) | 2026-05-26 |

### Post-MVP-close polish (2026-05-27 – 2026-05-28)

| Arc | Engram archive ID | MVP area served | Archive date |
|---|---|---|---|
| `level-up-choices-completion` | #927 | #3.1 builder (subclass/spells/features in level-up) | 2026-05-27 |
| `class-resource-bardic-inspiration` | #935 | #3.2 sheet (Bardic Inspiration resource) | 2026-05-27 |
| `class-resources-r07-finalize` | #941 | #3.2 sheet (R-07 all 7 features closed) | 2026-05-27 |
| `inventory-v3-list` (Slice A) | — | #3.2 sheet (inventory list redesign) | 2026-05-28 |
| `inventory-v3-simple` (Slice B) | #1075 | #3.2 sheet (inventory v3 simple items) | 2026-05-28 |
| `inventory-v3-advanced` (Slice C) | #1082 | #3.2 sheet (inventory v3 full — trilogy complete) | 2026-05-28 |
| `engine-ability-scores-authoritative` | #1216 | combat engine (parity) | 2026-05-29 |
| `engine-integration` (Slice 3) | #1116 | combat engine (composable modifier) | 2026-05-28 |
| `engine-adapter` (Slice 4) | #1127 | combat engine (modifier adapter) | 2026-05-28–29 |
| `engine-active-effects` (Slice 7) | #1158 | combat engine (active-effects catalog) | 2026-05-29 |

### Engine / combat track (2026-05-29 – 2026-06-04) — see §3 for freeze status

| Arc | Engram archive ID | What | Archive date |
|---|---|---|---|
| `engine-unified-duration-evaluator` | #1473 | Turn-anchor + absolute-round unified duration (PHB p.189) | 2026-05-31 |
| `engine-resist-immunity` | #1421 | Resistance/immunity gate (PHB p.197) | 2026-05-31 |
| `engine-class-resource-rest` (Slice 5) | #1483 | Barbarian rage-uses class resource | 2026-05-31 |

### World, map, and content (2026-06-01 – 2026-06-04)

| Arc | Engram archive ID | MVP area served | Archive date |
|---|---|---|---|
| `starting-equipment` | #1548 | #3.1 builder (equipment wizard step + inventory seed) | 2026-06-01 |
| `world-content-mvp` (Part 3 — final) | #1622 | #3.7 world content (factions/NPCs/events/journal/hexes UI) | 2026-06-02 |
| `character-codex-browser` (Slice 1) | — | #3.10 WM knowledge (bestiary in player codex) | ~2026-06-02 |
| `poi-world-level` | #1717 | #3.5 map (POIs re-anchored to world, migration 0036) | 2026-06-03 |
| `world-map-poi-layer` (Slice 2 of world-map-interactive) | #1694 | #3.5 map (POI marker layer + player cascade + PoiDetail) | 2026-06-03 |
| `poi-map-list` | #1727 | #3.5 map (map-overlay POI list + fly-to) | 2026-06-03 |
| `poi-world-create` | #1737 | #3.5 map (DM tap-to-create, edit, move, place-on-map) | 2026-06-03 |

### Web combat surface (2026-06-03 – 2026-06-04) — see §3 for freeze status

| Arc | Engram archive ID | What | Archive date |
|---|---|---|---|
| `web-combat-observe` (Slice A) | #1750 | Player read view + own-resource panel | 2026-06-03 |
| `web-combat-rage` (Slice B) | #1772 | Barbarian Rage controls, owner-OR-GM auth | 2026-06-03 |
| `web-combat-pass-turn` (Slice C1) | #1783 | PassTurnButton + TurnBanner advance | 2026-06-03 |
| `web-combat-attack` (Slice C2) | #1797 | AttackSheet + weapon attack vs NPC | 2026-06-04 |

---

## Section 3 — Frozen / Paused Tracks

### 3.1 Combat live-play UI — FROZEN (not in MVP)

Per `definition.md §5.1` (decision 2026-06-04): the combat engine and web combat surface are **paused / frozen** until the MVP lands. They are preserved, not deleted.

**Why frozen**: combat is explicitly OUT of the MVP scope. It was built as a deliberate exploration. The 10 MVP items (§3 of definition.md) take priority.

| Track | Engram archive IDs | Branch / commit | Status |
|---|---|---|---|
| Engine: resolution pipeline, action economy | — (engine slices 1-2, pre-engram-archive) | merged to main | FROZEN |
| Engine: composable modifier system (Slices 3–7) | #1116, #1127, #1158, #1421, #1473, #1483 | merged to main | FROZEN |
| Engine: Rage, Divine Smite, Hex, Counterspell, Concentration, conditions | — (git history on main) | merged to main | FROZEN |
| Web: `web-combat-observe` (Slice A) | #1750 | merged to main | FROZEN |
| Web: `web-combat-rage` (Slice B) | #1772 | merged to main | FROZEN |
| Web: `web-combat-pass-turn` (Slice C1) | #1783 | merged to main | FROZEN |
| Web: `web-combat-attack` (Slice C2) | #1797 | feat/web-combat-attack-web (current branch) | FROZEN |

**What was built**: full combat resolution engine (to-hit, damage, modifiers, conditions, effects, reactions, concentration), Rage, Divine Smite, Hex, Counterspell, Shield reaction, Stunning Strike; encounter tracker with initiative + action economy; web UI for observe/rage/pass-turn/attack.

**What resumes after MVP**: the remaining web slices (healing, conditions UI, DM controls), the full encounter management surface.

### 3.2 WM knowledge layer (`wm-knowledge-layer`) — PAUSED

The Bitácora/knowledge-layer SDD (#1808) is paused pending completion of this doc round and is item #3 in §1 above. Not lost — all design decisions are locked in engram (#1804 vision, #1806 decisions, #1808 proposal).
