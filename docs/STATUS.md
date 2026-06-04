# dungeon-hub — System Status

> Status: living document, last synced 2026-06-04 against engram #1809. Update when an SDD arc closes.

---

## 1. Pillar Overview

| Pillar | What | State |
|---|---|---|
| **A — Character system** | Builder, sheet, inventory, spells, XP, rest, level-up | ✅ Largely complete |
| **B — World & knowledge system** | Codex, Bitácora/Crónica, map, DM tools, JSON portability | 🟡 Partially shipped; most remaining work |

---

## 2. MVP Feature Status (per definition.md §3 + gap-audit #1809)

| # | MVP Item | Status | Key files / routes | Notes |
|---|---|---|---|---|
| 3.1 | **Character builder + manager** | ✅ | `apps/web/app/characters/[id]/wizard/*/page.tsx`; approval: `apps/api/src/http/routes/characters.ts:1321`; level-up: `:2404`; domain: `packages/domain/src/character/{level-up,multiclass}/` | Wizard L1 full (stats/race/class/background/equipment/spells/review), approval flow, level-up L1–L14, multiclass. |
| 3.2 | **Character sheet — view + edit + save** | ✅ | `apps/web/app/characters/[id]/page.tsx`; sheet tabs: resumen/habilidades/hechizos/recursos/inventario/notas | Inventory CRUD, spell add/remove+prep, XP, HP edit, rest, encumbrance. Notes tab exists; save path confirmed via PATCH. |
| 3.3 | **Codex — content coverage** | 🟡 | `apps/web/app/compendium/_components/data.ts:7-14`; API: `compendium.ts:551` (feats), `:826` (conditions) | 6 of 8 categories browsable (races/classes/backgrounds/items/spells/monsters). **Feats and Conditions** have full API+DB but are NOT in `CATEGORY_CONFIG` registry — no browser UI card. 2 of 8 missing. |
| 3.4 | **Codex — navigation, filters, search** | 🟡 | `apps/web/app/compendium/[category]/_components/compendium-list.tsx`; API filters: `compendium.ts:348-423` (spells), `:621` (monsters) | Name search on all 6; spells filter by class/level/school/ritual/concentration; monsters by CR/type/size. **No cross-category search from landing; items lack type filter.** |
| 3.5 | **Map — zoom + waypoints** | 🟡 | `apps/web/components/world/map/world-map-leaflet.tsx`; POI actions: `actions.ts:266,308,328` | Leaflet map with zoom range; POIs are full waypoints (create/place/edit/move/delete/status). **Mobile gap: `zoomControl` not explicitly enabled** — CRS.Simple disables Leaflet default +/– buttons. Pinch-zoom works. Waypoint shared-vs-private visibility model still open. |
| 3.6 | **DM — campaigns with invited players** | 🟡 | `apps/api/src/http/routes/campaigns.ts`; `apps/web/app/campanas/[id]/page.tsx` | Campaign CRUD + session management done. **CRITICAL GAP #782: no `POST /campaigns/:id/members`, no invite link, no atomic dual-write (worldMembers + campaignMembers).** Players cannot be invited post-creation. |
| 3.7 | **DM — manage world content** | 🟡 | `components/world/{npcs,factions,journal}/`; world events, hexes, POIs all CRUD wired | NPCs + factions + world events + locations/hexes + POIs + journal all ✅. **Gap: Quests** — `QuestsSinTocarList` component exists but `quests=[]` hardcoded; no DB table, no API, no CRUD. |
| 3.8 | **DM — create custom content** | 🔴 | `packages/compendium-import/src/index.ts` (CLI only) | Server-side enforcement exists (`rulesProfile`, `disabledEntities`, `modifierDefinitions`). **No DM-facing UI to add homebrew or upload JSON.** Import is CLI-only. DEC-1 (locked 2026-06-04): MVP path is JSON upload, not visual authoring. |
| 3.9 | **Import / export via JSON** | 🔴 | — | Import: CLI-only (`pnpm import:5etools`). **Export: zero — nothing, anywhere.** No character export, no config export, no NPC export. Biggest portability gap. |
| 3.10 | **West Marches knowledge layer** | 🟡 | `apps/web/app/cronica/`; `/codex`; `/mapa`; DB: `world_events`, `journal_entries`, `character_knowledge` | Substrate live (worldEvents, journalEntries, npcs, pois, factions, hexes, character_knowledge). Crónica/Codex/Map tabs ship. **Gaps: no player write-path** (all world content is DM-only); no rumor entity; no adventure board; `NovedadesFeed` hardcoded empty; character codex covers monsters only (bestiary Slice 1). |
| 3.11 | **Discord bot (read-only)** | ✅ | `apps/bot/src/commands/` (15 cmds) + `index.ts` registry | `/spell /feat /item /race /class /monster /session /world /lore /map /character /link /unlink /whoami /mi-hoja` — all wired (autocomplete + embeds + API). Read-only; bot writes are post-MVP. (Gap-audit #1809 wrongly said "only /mi-hoja" — corrected per engram #1810.) |

---

## 3. Route Map (apps/web/app)

| Route | Status | Notes |
|---|---|---|
| `/inicio` | ✅ | DM/Player dashboard, wired to real API |
| `/characters/[id]/wizard/*` | ✅ | Full 7-step wizard |
| `/characters/[id]` | ✅ | Sheet with 6 tabs |
| `/characters/[id]/level-up` | ✅ | Level-up flow L1–L14 + multiclass |
| `/compendium` | ✅ | Landing grid (6 real + 1 disabled) |
| `/compendium/[category]` | 🟡 | 6 of 8 categories; feats/conditions missing |
| `/codex` | ✅ | Role-aware dispatch (DM→facciones/npcs, Player→grid) |
| `/codex/[kind]` | 🟡 | Player scoped-list reuses registry; bestiary only |
| `/mapa` | ✅ | Leaflet tile map + POI CRUD |
| `/campanas` + `/campanas/[id]` | 🟡 | Campaign CRUD done; invite flow absent |
| `/cronica/eventos` + `/cronica/notas` | ✅ | Timeline + journal (DM write-path only) |
| `/encuentros` | ✅ (frozen) | Combat tracker V3 — **paused, not in MVP** |
| `/worlds/[id]` | ✅ | World roster + DM approval panel |
| `/link/[token]` | ✅ | Discord–user binding |

---

## 4. What Shipped Recently (post-2026-05-26)

These arcs shipped after the original MVP roadmap was declared "complete" (2026-05-26) and have no prior disk trail.

| Arc | Shipped | What it delivered | MVP area |
|---|---|---|---|
| `world-map-interactive` Slice 1 | ~2026-06-01 | Leaflet tile map, tiling pipeline, Y-axis lock, Lista|Mapa toggle | #3.5 map |
| `world-map-poi-layer` (Slice 2) | 2026-06-03 | POI marker layer, player cascade, PoiDetail, seed tooling | #3.5 map |
| `poi-world-level` | 2026-06-03 | POIs re-anchored to world (migration 0036), hybrid visibility, world-scoped queries | #3.5 map |
| `poi-map-list` | 2026-06-03 | Map-overlay POI drawer + fly-to | #3.5 map |
| `poi-world-create` | 2026-06-03 | DM tap-to-create, edit, move, place-on-map mode | #3.5 map |
| `world-content-mvp` (Part 3) | 2026-06-02 | Facciones/NPCs/journal/events/hex UI final close | #3.7 world content |
| `starting-equipment` | 2026-06-01 | Equipment wizard step, inventory seed from class/background | #3.1 builder |
| `web-combat-observe` (Slice A) | 2026-06-03 | Player read view + ResourcePanel | combat (frozen) |
| `web-combat-rage` (Slice B) | 2026-06-03 | Barbarian Rage controls + E2E | combat (frozen) |
| `web-combat-pass-turn` (Slice C1) | 2026-06-03 | PassTurnButton + TurnBanner advance | combat (frozen) |
| `web-combat-attack` (Slice C2) | 2026-06-04 | AttackSheet + weapon attack vs NPC | combat (frozen) |
| background language validation fix | 2026-06-04 | Injects `worldRefData` into background write-path | #3.1 builder |

---

## 5. Known Gaps / Not Yet Built

See `docs/ROADMAP.md §1` for the prioritized work plan. Summary:

| Gap | Severity | Definition.md item |
|---|---|---|
| Campaign invite flow (#782) | **MVP blocker** | #3.6 |
| JSON export (zero today) | **MVP blocker** | #3.9 |
| West Marches player write-path (Bitácora) | High | #3.10 |
| Custom content via JSON upload | High | #3.8 |
| Quests (no schema, no API) | Medium | #3.7 |
| Feats + Conditions compendium browser | Low effort | #3.3 |
| Codex cross-category search + item type filter | Low | #3.4 |
| Map mobile zoom buttons + waypoint visibility model | Low | #3.5 |
