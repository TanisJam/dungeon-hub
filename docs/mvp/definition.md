# MVP Definition — dungeon-hub

> **Status**: Re-defined **2026-06-04**. Supersedes the 2026-05-25 lock (which was read-only-focused and listed combat as the main surface). This is the **source of truth for scope decisions**.
>
> **How to use**: Every SDD proposal MUST validate against §3 (IN) and §5 (OUT) before scoping. If a feature is ambiguous, this doc is the tie-breaker; if this doc is ambiguous, raise it for resolution before designing.
>
> **Grounding**: Current-state markers (✅ done / 🟡 partial / 🔴 missing) are verified against real code in the gap-audit `mvp/gap-audit-2026-06-04` (engram #1809). The remaining-work list (§7) is derived from it.

---

## 1. What dungeon-hub is — West Marches first

dungeon-hub is a **D&D 5e (PHB 2014) companion for a West Marches campaign**: a shared, persistent world played asynchronously by **3 DMs (equal authority) + 10–15 players**, where characters cross organically between tables and one-shots.

West Marches is **not** "character sheets + a rulebook + a map". Its defining trait is **shared, player-built, persistent KNOWLEDGE of a world that lives on between sessions and DMs**. An app that only manages sheets and rules would be a competent 5e tool but not specifically a West Marches one. **That knowledge layer is the differentiator and the soul of this MVP** (see §4).

**Operating constraints (carry-over, still locked):**

- **Mobile-first**: 375px (iPhone SE) is the target viewport. Players read on their phone during play. Every UI is designed mobile-first, desktop second. See [engram #450].
- **In-table usage is read-only reference.** Mutations (HP, inventory, XP) happen *between* sessions, not live at the table. (The one deliberate exception — the combat tracker — is **paused**, see §5.)
- **PHB 2014 is the rules source of truth.** See `CLAUDE.md §1.1`.
- **The database is the runtime source of truth** — reference data (languages, items, races, classes, spells…) lives in the DB so DMs can customize without a re-deploy. See [engram #513], `CLAUDE.md §1.2`.
- **No launch deadline.** This is a passion project; correctness and depth beat speed.

---

## 2. The two pillars

| Pillar | What it is | Maturity |
|---|---|---|
| **A. The character system** | Build a character, level it, run its sheet (inventory, spells, XP, resources, rest). | ✅ Largely shipped. |
| **B. The shared world & knowledge system** | The codex, the guild logbook (Bitácora), the map, DM world-management and custom content, and JSON portability. | 🟡 Partially shipped; this is where most remaining MVP work lives. |

Pillar B is the West Marches differentiator. The MVP is **not done until Pillar B holds its weight.**

---

## 3. IN scope (the MVP feature list)

Each item states the **target** and its **current status** (per gap-audit #1809). The work to close each gap is tracked in `docs/ROADMAP.md`.

### 3.1 Character builder + manager — ✅
Wizard L1 (stats / race / class / background / equipment / spells / review), approval flow (`pending_approval` → `active`, any world GM approves), level-up L1–L14 for the 12 PHB classes, multiclass. Wired end-to-end.

### 3.2 Character sheet — ✅
View **+ edit + save**. Tabs: resumen, habilidades, hechizos, recursos, inventario, notas. Inventory CRUD, spell add/remove + prep, XP grant, HP edit, rest (short/long), encumbrance. Wired.

### 3.3 Codex — content coverage — 🟡
A browsable reference for each of: **races, classes, feats, backgrounds, items, spells, bestiary/monsters, conditions**.
- Today: 6 of 8 browsable (races, classes, backgrounds, items, spells, monsters). **Feats and Conditions** have full API + DB but **no browser UI** — they are one registry entry away from appearing.

### 3.4 Codex — navigation, filters, search — 🟡
Good nav, filters, and search across the codex.
- Today: name search on all; spells filter by class/level/school/ritual/concentration; monsters by CR/type/size. **Gaps**: no cross-category search from the landing; items lack a type filter.

### 3.5 Map — zoom + waypoints — 🟡
A world map with zoom controls and player-placeable waypoints.
- Today: Leaflet map with min/max zoom; POIs act as waypoints with full create/place/edit/move/delete/status CRUD. **Gaps**: no visible +/- zoom buttons on mobile (CRS.Simple disables Leaflet defaults); **shared-vs-private visibility** of waypoints is a West Marches design decision still open (ties into §4).

### 3.6 DM — campaigns with invited players — 🟡
DM creates campaigns (partidas) and manages them with invited players.
- Today: campaign CRUD + session management ✅. **Gap (HIGH): the invite flow does not exist** — no `POST /campaigns/:id/members`, no invite link, no atomic dual-write (`worldMembers` + `campaignMembers`). This is gap #782 and players currently cannot be invited post-creation. **Critical MVP blocker.**

### 3.7 DM — manage world content (NPCs, quests, etc.) — 🟡
DM manages the game world: NPCs, quests, factions, locations.
- Today: NPCs (full CRUD + faction attach), factions (CRUD + reputation), locations/hexes + POIs, world events, journal — all ✅. **Gap: Quests** have a UI shell but **no DB table and no API** — a real build.

### 3.8 DM — create custom content for the world — 🔴 *(scope decision below)*
DM adds homebrew content (custom races, classes, items, spells, NPCs, etc.) per world.
- Today: server-side enforcement exists (`rulesProfile`, `disabledEntities`, `modifierDefinitions`), but there is **no DM-facing way to add content** — import is CLI-only.
- **DEC-1 (LOCKED 2026-06-04):** MVP path is **custom content via JSON upload/import** — the DM uploads a JSON pack and enables it per world, reusing the existing import pipeline. The **visual authoring UI (build a race/class from a form) is deferred to post-MVP** (§5.2). This collapses #3.8 and #3.9 into largely the same machinery: a DM-accessible import surface + per-world enablement.

### 3.9 Import / export via JSON — 🔴
Import **and export** of: characters, world configs, NPCs, and any customizable content (classes, races, items, spells…).
- Today: import exists but is **CLI-only** (`pnpm import:5etools`, `packages/compendium-import`). **Export is zero — nothing, anywhere.** This is the single biggest portability gap.
- MVP target: DM-accessible import (upload) + export endpoints. Recommended ordering: **character export first** (high value, low risk), then config/NPC, then full content round-trip (referential integrity is the hard part — a spell → class → source chain).

### 3.10 West Marches knowledge layer — 🟡
The shared guild knowledge loop: **Bitácora (flujo) → Codex (índice)**, rumors, and an adventure board. See §4 for the full model.
- Today: the substrate is live (`worldEvents`, `journalEntries`, `npcs`, `pois`, `factions`, `hexes`, `character_knowledge`) with full API; the Crónica/Codex/Map tabs ship. **Gaps**: no **player write-path** (all world content is DM-only today), no **rumor/canonical** distinction, no **adventure board**, no **bitácora→codex promotion link**, `NovedadesFeed` stub hardcoded empty.

### 3.11 Discord bot (read-only) — ✅
A Discord bot exposing the world/compendium as read-only reference, plus character self-service.
- Today: 15 commands shipped and registered (`apps/bot/src/commands/`): `/spell`, `/feat`, `/item`, `/race`, `/class`, `/monster`, `/session`, `/world`, `/lore`, `/map`, `/character`, `/link`, `/unlink`, `/whoami`, `/mi-hoja` — all with autocomplete + embeds + API calls. (Note: the 2026-05-29 code-audit and gap-audit #1809 wrongly reported "only /mi-hoja"; corrected per [engram #1810].)
- Scope: **read-only** (no bot writes — `sessionEvents` from Discord stays post-MVP). No E2E; manual smoke against live Discord (per `CLAUDE.md §5`).

### Idioma (carry-over, locked)
UI in **Rioplatense Spanish (voseo)**. Rules/descriptions/names of spells/items/features in **English** (original). No i18n system needed for rule data.

---

## 4. The West Marches knowledge layer (the differentiator, expanded)

This is the heart of Pillar B. Model and decisions captured in [engram #1804] (vision), [engram #1806] (locked decisions), [engram #1808] (proposal — currently **paused**, resumes after this doc round is done).

### 4.1 Flujo ↔ Índice (the keystone architecture)
- **Bitácora del gremio = the FLOW.** Raw, chronological, collaborative, guild-wide (everyone reads/writes). Contribution types: monsters encountered, locations (waypoints), tips, NPCs, session recaps, rumors. Topic threads = "ramas".
- **Codex = the CRYSTALLIZED INDEX.** One rich page per entity (person / creature / object / spell / place), with detail + images + lore. Seeded with the character's basics, **grows with play**.
- **The bitácora FEEDS the codex** (they are NOT separate systems): a sighting in the bitácora is promoted/linked to that entity's codex page (`refEntityKind` + `refEntityId`); the codex page accumulates its linked sightings. Knowledge is born messy (flow) and matures into reference (index).

### 4.2 Tablero de anuncios (the actionable layer)
Distinct from the bitácora. Quest/expedition calls. In West Marches the board is **how players choose adventures**; DMs derive the offers from the rumors and details surfacing in the bitácora.

### 4.3 Rumores (unverified knowledge — a feature, not a bug)
A rumor may be **false**. Misinformation is core to West Marches. DMs seed rumors; players chase them; some get confirmed (promoted to canonical codex), others debunked.

### 4.4 Truth / visibility layers (locked)
1. **Personal** — what the character knows / private notes (codex seeds here).
2. **Guild** — what someone chose to share (opt-in).
3. **Canonical** — sealed by a DM.
- **Moderation = APPEND-ONLY + HIDE** (locked, D2): no hard delete ever — the record is immutable; misinformation lives. DM can **debunk** (label false) and **hide** (visibility flag for spam/OOC). Nothing disappears.
- **Seal shape** (locked, D3): `sealedStatus: 'confirmed' | 'debunked' | null` + `sealedBy` + `sealedAt`.
- **Nav (locked, D1)**: the `Crónica` tab is **renamed to `Bitácora`**; Eventos (DM-official, `worldEvents`) + Notas become read facets / contribution types within the flow; `worldEvents` stays as the canonical layer behind a read-time union. No destructive migration.

---

## 5. OUT of scope (post-MVP)

### 5.1 Combat live-play UI — ⏸ PAUSED / FROZEN
The combat engine (resolution engine, action economy, reaction bus, concentration, Rage/Bless/Hex/Smite, etc.) and the web combat surface (observe / rage / pass-turn / attack — slices A/B/C1/C2) **shipped as a deliberate exploration**, but combat is **NOT part of this MVP** and is **frozen** until the MVP lands. It is preserved, not deleted. (Decision 2026-06-04.)

### 5.2 Visual homebrew authoring UI
Building a race/class/spell from a visual form is post-MVP. Custom content in the MVP arrives via **JSON import** (see DEC-1, §3.8).

### 5.3 Still out (carry-over from the 2025-05 lock, pruned)
- VTT plugins (Owlbear/Foundry/Roll20); bot writes beyond `/mi-hoja`.
- Public social profiles, cosmetics, achievements, public timelines.
- In-app shop / economy / player-to-player transactions (schema stays forward-compatible via `items.cost`).
- Multi-world admin UI (MVP seeds one world manually); UI to CRUD worlds.
- Survival rules, levels >14, 2024 rules (XPHB/XDMG/XMM — not even as JSON packs).

---

## 6. Shippable criteria

The MVP is shippable when **all** hold:

### A. Automated tests
- `pnpm test` green across all packages; `pnpm typecheck` clean.
- E2E (Playwright) green for the critical flows, including the now-IN ones:
  - Wizard L1 (≥3 classes) → `pending` → DM approve → `active`.
  - Level-up L1→L2 (≥2 classes, one with an L2 resource).
  - **Campaign invite**: DM invites a player → player gains campaign access.
  - **Codex browse**: all 8 content types reachable + searchable at 375px.
  - **Bitácora loop**: player writes a sighting tagged to an entity → DM seals → it surfaces on the codex page + NovedadesFeed.
  - **JSON round-trip**: export a character → re-import → equivalent character.
  - Sheet view + edit at 375px.

### B. Functional completeness
- All 10 IN items at ✅ (no 🔴, no MVP-blocking 🟡). See §7 for the live gap list.

### C. Foundation & ops
- DB as runtime source of truth — no MVP-blocking `// TODO #513` hardcodes.
- `pnpm dev` starts the full stack (api + web + bot + supabase) or it is documented.
- `pg_dump` backup/restore documented (`docs/onboarding/operator-checklist.md`).

### D. Documentation
- This doc + `docs/STATUS.md` + `docs/ROADMAP.md` current.
- Manual JSON schema documented for homebrew (`docs/manuals/dsl.md`).

---

## 7. Remaining work to MVP (prioritized — derived from gap-audit #1809)

The authoritative live tracker is `docs/ROADMAP.md`. Headline order by impact:

1. **Campaign invite flow** (#3.6, gap #782) — MVP blocker; players can't be invited today.
2. **JSON export** (#3.9) — zero today; start with character export.
3. **West Marches write-path** (#3.10) — the Bitácora contribution loop (the paused `wm-knowledge-layer` SDD, #1808).
4. **Custom content via JSON upload** (#3.8) — pending DEC-1.
5. **Quests** (#3.7) — DB table + API + wire the existing UI shell.
6. **Feats + Conditions codex browser** (#3.3) — small; API+DB ready, add the registry entries.
7. **Codex cross-category search + item filter** (#3.4).
8. **Map mobile zoom buttons + waypoint visibility model** (#3.5).

---

## 8. Architecture invariants (condensed — full detail in CLAUDE.md)

- **DB as runtime source of truth** ([#513]); domain stays pure; validators take injected world ref-data.
- **Mobile-first 375px** ([#450]); server-component-first; defer client JS.
- **Modular manual system**: JSON packs → DB rows tagged by `source`; per-world enable/disable via `rulesProfile` + `disabledEntities`; conflict resolution per world (`docs/manuals/conflict-resolution.md`).
- **Forward-compat constraint**: even OUT features must not be schema-blocked (e.g. shop is OUT but `items.cost` is IN).
- **World is the parent of campaigns**; characters scoped to `worldId`; multi-DM via `worldMembers.role=gm` ([engram #761]).

---

## Cross-links

- Gap-audit (current state): engram `mvp/gap-audit-2026-06-04` (#1809).
- WM knowledge layer: engram #1804 (vision), #1806 (locked decisions), #1808 (proposal, paused).
- Live status / roadmap: `docs/STATUS.md`, `docs/ROADMAP.md` *(to be created in this doc round)*.
- Decisions: `mvp/data-model-decision` (#761), `mvp/architecture-philosophy` (#762), DB-as-SoT (#513), mobile-first (#450).
- Project conventions: `CLAUDE.md`. Manual system: `docs/manuals/dsl.md` + `docs/manuals/conflict-resolution.md`.
- Superseded historical docs: `PRD_DnD_WestMarches.md`, `IMPLEMENTATION_PLAN.md`, `CONSTRAINTS.md` *(banners added in this doc round)*.
