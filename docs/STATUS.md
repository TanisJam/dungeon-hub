# dungeon-hub — System Status

> Status: living document, last synced 2026-09-16 against `main`. Supersedes the 2026-09-09 sync,
> whose §5 still listed `#3.8 Custom content via JSON upload` as an open High gap three days after
> ROADMAP.md §1 had already recorded it shipped (2026-09-09) — the exact §2-vs-§5 drift the doc
> before *that* one was written to warn against. Both remaining `#3.10` items closed this batch
> (PRs #80, #82, #83), which brings the MVP to **10/10 on `definition.md §3`** — see §2. Also new
> since 2026-09-09: the `ui-craft-2026-09-10` visual/accessibility audit closed out entirely
> (F1–F13), an accessibility sweep took AA contrast failures and sub-44px tap targets to zero, e2e
> now runs in CI, and the API was redeployed (code-only; see §6).
>
> **Production now runs `main`.** The API was swapped on 2026-09-09, ending a three-month drift in
> which its source dated to 11 June, and swapped again this session to pick up keyset pagination
> (§6). Both halves are current: Vercel deploys `apps/web` on every push, and the API image was
> rebuilt from `main` and verified before each swap. Rows below describe `main`, and for the first
> time in this document's history that is also what a visitor talks to. See §6 and
> [`docs/onboarding/api-deploy.md`](./onboarding/api-deploy.md) — the API deploy is still manual, so
> this alignment is a fact about today, not a property of the system.

---

## 1. Pillar Overview

| Pillar | What | State |
|---|---|---|
| **A — Character system** | Builder, sheet, inventory, spells, XP, rest, level-up | ✅ Largely complete |
| **B — World & knowledge system** | Biblioteca (formerly Codex), Bitácora, map, Mercado, DM tools, JSON portability | ✅ Complete for MVP scope (#3.3–#3.10 all ✅, see §2). Bitácora/knowledge system, Mercado shop, custom content upload, both halves of JSON import/export, and feed interactivity (adventure board, sealing, tap-to-open, keyset pagination) have all shipped. Note: "Codex" as a route no longer exists (see §3) — reference browsing lives at `/compendium` (Biblioteca), DM tools at `/herramientas/*`. |

---

## 2. MVP Feature Status (per definition.md §3 + gap-audit #1809)

| # | MVP Item | Status | Key files / routes | Notes |
|---|---|---|---|---|
| 3.1 | **Character builder + manager** | ✅ | `apps/web/app/characters/[id]/wizard/*/page.tsx`; approval: `apps/api/src/http/routes/characters.ts:1497` (was cited at `:1321`, drifted); level-up: `:2619` (was `:2404`); domain: `packages/domain/src/character/{level-up,multiclass}/` | Wizard L1 full (stats/race/class/background/equipment/spells/review), approval flow, level-up L1–L14, multiclass. Line citations re-verified 2026-09-07. |
| 3.2 | **Character sheet — view + edit + save** | ✅ | `apps/web/app/characters/[id]/page.tsx`; sheet tabs: resumen/habilidades/hechizos/recursos/inventario/notas | Inventory CRUD, spell add/remove+prep, XP, HP edit, rest, encumbrance. Notes tab exists; save path confirmed via PATCH. |
| 3.3 | **Biblioteca (formerly "Codex") — content coverage** | ✅ | `apps/web/app/compendium/_components/data.ts:7-14` (6-card landing grid); registry: `apps/web/app/compendium/[category]/_config/registry.ts:48` (`CATEGORY_CONFIG`, 8 entries); API: `compendium.ts:587` (feats, was cited at `:551`), `:862` (conditions, was `:826`) | 8 of 8 categories browsable via `/compendium/[category]`; the landing grid (`/compendium`) intentionally shows only 6 (items + monsters moved out per codex-ia-reframe W1). Feats + Conditions shipped 2026-06-05. Closes #3.3. Line citations re-verified 2026-09-07. |
| 3.4 | **Biblioteca — navigation, filters, search** | ✅ | `apps/web/app/compendium/[category]/_components/compendium-list.tsx`; API filters: `compendium.ts:361-424` (spells, was `:348-423`), `:696` (monsters, was `:621`) | Name search on all 8; spells filter by class/level/school/ritual/concentration; monsters by CR/type/size; item type filter ✅ shipped 2026-06-05. Cross-category search from the landing ✅ shipped 2026-09-08 (search sheet fanning out across all 8 categories). Closes this row. |
| 3.5 | **Map — zoom + waypoints** | ✅ | `apps/web/components/world/map/world-map-leaflet.tsx`; POI actions: `apps/web/app/mapa/actions.ts:275` (createPoi), `:317` (updatePoi), `:337` (deletePoi) — was cited at `actions.ts:266,308,328`, drifted | Leaflet map with zoom range; POIs are full waypoints (create/place/edit/move/delete/status). **Correction**: the waypoint shared-vs-private visibility model is NOT open — it is already implemented as a hybrid status-gate model in the `pois` table (`apps/api/src/infra/db/schema.ts:459-465`, shipped with `poi-world-level`, 2026-06-03, i.e. before even the previous sync): DM sees all incl. `dmNotes`; players see `status != 'unknown'`, never `dmNotes`. The old "still open" note was wrong. Separately, the "map mobile zoom buttons" gap is **closed and was never real**: verified live on 2026-09-07 against production at a 390px mobile viewport, `.leaflet-control-zoom` renders with both `+`/`-` buttons visible. The old note's causal claim ("CRS.Simple disables the default buttons") does not match Leaflet's behaviour and had no code support. **A defect found in the same check has since been fixed** (2026-09-07): the map rendered no tiles because all 1398 objects sat one directory level too deep on the volume, so Storage raised `ENOENT` and the browser dropped the JSON error body as `ERR_BLOCKED_BY_ORB`. Re-uploaded via `apps/api/scripts/upload-map-tiles.ts`. Re-verified 2026-09-09 by sampling the pyramid across z=0..3: every in-grid tile serves `200 image/jpeg`, and out-of-grid coordinates return a clean `not_found` as they should. |
| 3.6 | **DM — campaigns with invited players** | ✅ | `apps/api/src/http/routes/campaigns.ts`; `apps/web/app/campanas/[id]/page.tsx` | Campaign CRUD + session management + invite flow + session play-loop all shipped. Invite-link mechanism (`campaign_invite_tokens`, archive #1877). Session UI shipped (#1916). Role model fixed (#1908–#1929). |
| 3.7 | **DM — manage world content** | ✅ | `components/world/{npcs,factions,journal}/`; world events, hexes, POIs all CRUD wired | NPCs + factions + world events + locations/hexes + POIs + journal + quests all ✅. Quests shipped 2026-06-05 (migration 0038, archive #1895). |
| 3.8 | **DM — create custom content** | ✅ | `apps/api/src/server.ts:17,59` (registers `homebrewRoute`); `apps/api/src/http/routes/homebrew.ts`; web: `apps/web/app/herramientas/contenido/page.tsx` + `_api-supports-homebrew.ts` | **Shipped 2026-09-09** (DEC-1, locked 2026-06-04): `POST /worlds/:worldId/homebrew/items` + a paste-a-JSON textarea at `/herramientas/contenido`, items only for this slice. The source code is per-world (`HB-<first 8 hex of worldId>`) since compendium tables are global and keyed `(slug, source)`. Verified against production: the endpoint answers `401` unauthenticated (this repo's own proof a route is live — `docs/onboarding/api-deploy.md`). Visual authoring is still post-MVP. Closes #3.8. |
| 3.9 | **Import / export via JSON** | ✅ | `apps/api/src/http/routes/characters.ts:1355` (`GET /characters/:id/export`); `apps/web/app/characters/[id]/_export-button.tsx` (was described as a "danger-zone island" — no such naming exists in the code) | Character export ✅ shipped 2026-06-05 (archive #1885, versioned `schemaVersion:1` envelope). **Character re-import shipped and is live**: `POST /characters/import` (`characters.ts:806`) merged 2026-09-08 and reached production with the 2026-09-09 API swap; the web UI (`/characters/import`) merged as PR #20 the same day. Verified against production: the endpoint answers `401` unauthenticated where it answered `404` before the swap, and the page redirects to `/` for anonymous visitors instead of 404ing. The end-to-end flow is now also covered by an e2e round-trip spec — see §5. **World export shipped 2026-09-09**: `GET /worlds/:worldId/export` (GM-only, same `schemaVersion:1` envelope) with a download control under `/herramientas/contenido`. It queries `quests` and `journal_entries` directly rather than through their list use-cases, which cap at 500 rows — right for a paginated list, wrong for a backup that would silently truncate. Both halves of #3.9 exist and are exercised end-to-end in CI. Closes #3.9. |
| 3.10 | **West Marches knowledge layer** | ✅ | `apps/web/app/bitacora/`; `apps/web/app/compendium/` (Biblioteca, formerly `/codex`); `apps/web/app/mercado/` + `apps/web/app/herramientas/tienda/`; `apps/web/app/mapa/`; `apps/api/src/use-cases/world/{aggregate-guild-feed,feed-cursor}.ts`; DB: `world_events`, `journal_entries`, `character_knowledge`, `bitacora_pages`, `guild_contributions` | Substantially advanced via codex-ia-reframe arc (archives #1971–#2055), plus more shipped since. **Newly shipped (since 2026-06-08)**: `NovedadesFeed` wired to the real `aggregateGuildFeed` backend via `apps/web/components/inicio/feed-to-novedad.ts` (2026-09-03) — closes the prior "feed hookup" gap; Mercado shop — player browse+buy at `/mercado`, DM curation at `/herramientas/tienda`, `POST /characters/:id/shop/buy` (`characters.ts:3009`) (2026-09-03) — closes the prior "Mercado deferred" gap. **Previously shipped** (already reflected before this sync): player write-path (guild contributions + tags + unified feed + share-personal-page-to-guild); Bitácora personal (Conocidos + Páginas + tags); character codex covers monsters + NPCs + factions + locations. **Adventure board shipped 2026-09-09**: `/tablero`, a player-facing read of the quests currently on offer, reached from a fifth Atajo on `/inicio`. It needed no schema and no endpoint — `quests` already carried status and visibility, and `GET /worlds/:worldId/quests` already ran `filterQuestsByAccess`. Only `available` and `active` reach it; completed and abandoned quests are history, not announcements. **Both remaining items closed this session**: feed entity tap-to-open (PR #80) — the linked-entity card in `feed-card.tsx` is now a real `<Link>`, scoped per viewer: `bestiary` (`/compendium/monsters?slug=&source=&q=`) and `location` (`/mapa?poi=`) are reachable by both roles; `npc` (`/herramientas/npcs?npc=`) and `faction` (`/herramientas/facciones?faccion=`) resolve to a link for a DM only, because those two pages `notFound()` for anyone else and the bitácora is a player-facing surface. Keyset pagination (PR #82, `apps/api/src/use-cases/world/feed-cursor.ts` — total order `sortAt DESC, sourceRank ASC, id DESC`) plus the web client switching from `offset` to `cursor` (PR #83) — the legacy offset path stays on the API for the manual-deploy window but the client no longer uses it. Closes #3.10; the MVP is now 10/10. |
| 3.11 | **Discord bot (read-only)** | ✅ | `apps/bot/src/commands/` (15 cmds) + `index.ts` registry | `/spell /feat /item /race /class /monster /session /world /lore /map /character /link /unlink /whoami /mi-hoja` — all wired (autocomplete + embeds + API). Read-only; bot writes are post-MVP. (Gap-audit #1809 wrongly said "only /mi-hoja" — corrected per engram #1810.) |

---

## 3. Route Map (apps/web/app)

> Re-verified 2026-09-07 by enumerating every `apps/web/app/**/page.tsx` on disk (`fd -t f page.tsx apps/web/app`) and reconciling each row against it. **`/codex` and `/codex/[kind]` were removed** — this is the error the previous sync's own header date should have caught (see below).

| Route | Status | Notes |
|---|---|---|
| `/` | ✅ | Public landing; redirects to `/inicio` when authenticated. Has a demo-mode CTA backed by `apps/api/scripts/seed-demo.ts`. |
| `/inicio` | ✅ | DM/Player dashboard, wired to real API. Novedades panel now wired to the real guild feed (`feed-to-novedad.ts`, 2026-09-03) — previously hardcoded empty. |
| `/dashboard` | ✅ | Account-level landing (character roster + campaigns), pre-world-selection. Missing from the previous route map despite being the redirect target for `/settings`, wizard flows, and character creation, and the entry point for most Playwright E2E specs. |
| `/personajes` | ✅ | World-scoped character roster with status filter chips; desktop-sidebar nav item (not in the mobile 5-tab bar). Missing from the previous route map. |
| `/characters/new` | ✅ | Character creation entry point. |
| `/characters/[id]/wizard/*` | ✅ | Full 7-step wizard |
| `/characters/[id]` | ✅ | Sheet with 6 tabs (resumen/habilidades/hechizos/recursos/inventario/notas); `notas` also hosts the personal Bitácora (Conocidos + Páginas) |
| `/characters/[id]/level-up` | ✅ | Level-up flow L1–L14 + multiclass |
| `/compendium` | ✅ | "Biblioteca" landing grid (6 real + 1 disabled). Renamed in nav from "Codex"; URL path unchanged. |
| `/compendium/[category]` | ✅ | 8 of 8 categories browsable (`CATEGORY_CONFIG`: spells, items, races, classes, backgrounds, monsters, feats, conditions) |
| `/mercado` | ✅ | **New since the previous sync** (shipped 2026-09-03). Player-facing shop: browse + buy mundane items the DM has marked for-sale. |
| `/herramientas` | ✅ | **New since the previous sync.** DM-tools index; redirects to `/herramientas/facciones`. Replaces the deleted `/codex` DM surfaces. |
| `/herramientas/facciones` | ✅ | Moved from `/codex` (deleted 2026-06-06). |
| `/herramientas/npcs` | ✅ | Moved from `/codex`. |
| `/herramientas/quests` | ✅ | Moved from `/codex/quests`. |
| `/herramientas/tienda` | ✅ | **New since the previous sync** (2026-09-03). DM shop curation (for-sale allowlist). |
| `/mapa` | ✅ | Leaflet tile map + POI CRUD |
| `/campanas` + `/campanas/[id]` + `/campanas/new` | ✅ | Campaign CRUD + invite flow + session play-loop |
| `/campanas/[id]/sessions/[sid]` | ✅ | Session detail (roster + event timeline) |
| `/invite/[token]` | ✅ | Campaign invite accept screen. Real, live route — missing from the previous route map. |
| `/bitacora` | 🟡 | Guild feed (contributions + journal + events unified; tag filter; Aportar FAB). Route renamed from `/cronica` (barrido-final). API URL `/worlds/:id/cronica-feed` kept. |
| `/bitacora/eventos` + `/bitacora/notas` | ✅ | Timeline + journal (DM write-path). Former `/cronica/*` routes, renamed. |
| `/encuentros` | ✅ (frozen) | Combat tracker — **paused, not in MVP**. See "Also found" below: engine/API work on this track continued well past the documented 2026-06-04 freeze date. |
| `/worlds/[id]` | ✅ | World roster + DM approval panel |
| `/link/[token]` | ✅ | Discord–user binding |
| ~~`/codex`~~ / ~~`/codex/[kind]`~~ | **removed** | Deleted 2026-06-06 (`feat(web): delete /codex tree + /characters/[id]/codex + update E2E specs`, commit `b892e74`) — two days *before* the previous sync's own "2026-06-08" date, and confirmed absent today (`fd -t d -d 1 . apps/web/app` has no `codex`; live `/codex` 404s). Reference browsing moved to `/compendium` (Biblioteca); DM tools moved to `/herramientas/*`; world-knowledge browsing (monsters/NPCs/factions/locations) lives in character `Conocidos` (personal Bitácora) instead of a `[kind]` route. The previous doc's claim that `/codex` was a shipped, role-aware-dispatch route was wrong on the day it was written, not just stale. |

---

## 4. What Shipped Recently (post-2026-05-26)

These arcs shipped after the original MVP roadmap was declared "complete" (2026-05-26) and have no prior disk trail. Table extended 2026-09-07 with everything shipped since the previous 2026-06-08 sync (see `git log --since=2026-06-08 --oneline`, 109 commits) — rows below the `background language validation fix` row are new to this sync.

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
| `/codex` deletion + `/herramientas` split | 2026-06-06 | Deleted `/codex` tree; DM tools (facciones/npcs/quests) moved to `/herramientas/*`; Biblioteca grid narrowed to library-only categories | IA cleanup / #3.10 |
| Combat engine batches B5–B10 | 2026-06-09 – 2026-06-12 | Ability checks, initiative roll, rage DSL rewrite, contest/grapple/shove, surprise gate — substantial engine feature work continued well after the documented 2026-06-04 "freeze" decision (see report) | combat (frozen track) |
| Mercado shop (Wave 3) | 2026-09-03 | Shop curation (DM, `/herramientas/tienda`), buy UI (player, `/mercado`), `purchaseItems` currency logic, `shopCuration` rules-profile flag, for-sale allowlist | #3.10 WM knowledge (closes "Mercado deferred") |
| Guild feed → home Novedades wiring | 2026-09-03 | `feed-to-novedad.ts` wires the already-shipped `aggregateGuildFeed` backend into `/inicio`'s Novedades panel (previously hardcoded empty) | #3.10 WM knowledge |
| UX consistency + desktop shell | 2026-09-03 | Desktop persistent sidebar (`DesktopSidebar`), line-icon polish, scroll-fade affordance, enriched landing marketing page, 404/dead-route/placeholder cleanup | cross-cutting UX |
| Demo/dev tooling | 2026-09-03/04 | `apps/api/scripts/seed-demo.ts` (demo world + map POIs), `apps/api/scripts/upload-map-tiles.ts` (Supabase Storage tile uploader) | dev/operator experience |
| Surprise first-turn action-gate adapter | 2026-09-04 | IO adapter for the pure `isSurprisedFirstTurn` predicate; drops redundant inline gate blocks from the frozen combat/encounters route | combat (frozen track) |
| Resilience pass | 2026-09-07 | Root/route error boundaries (`app/error.tsx`, `app/global-error.tsx`), fail-open Supabase auth-check middleware, API request timeouts + typed `ApiNetworkError` | cross-cutting reliability |
| Reproducible setup pass | 2026-09-07 | Restored `infra/supabase/docker-compose.override.yml`, pinned `SUPABASE_REF`, corrected env templates, added a "Known setup gaps" README section | dev/operator experience |
| API swap + character import UI | 2026-09-09 | Rebuilt the API image from `main`, verified it against the production database in an unrouted container, and promoted it — ending the three-month drift. PR #20 then released the `/characters/import` UI that had been held back so the app would not ship a button that 404s | #3.9 / deploy |
| Test infrastructure pass | 2026-09-09 | Restored `localStorage` in the jsdom test environment (Node 26 defines the global as `undefined`, and vitest skips copying jsdom names already present on the Node global); skip-on-absent guard for the 5etools races block; an API unit lane that runs without live infra; `.nvmrc`; and the first CI workflow this repo has ever had, running 3936 tests on every PR | dev/operator experience |
| `ui-craft-2026-09-10` audit close-out | 2026-09-10/12 | F1–F13 all landed: persistent shell + loading skeletons (F1), type hierarchy + `text-label` token (F3), fixed duplicate `h1` + regrouped DM action stack (F8), empty states (F9), themed native controls (F10), long-name clamp + radius scale (F11/F12), Atajos DM icon backgrounds (F13), desktop widths (F4), map marker taps (fix), plus the e2e rot F10/F13 evidence surfaced along the way | cross-cutting UX + #3.10 |
| Accessibility sweep | 2026-09-11 | AA contrast: 43 text nodes across 17 routes (8 distinct token pairs) → 0, guarded by `apps/web/lib/contrast-guard.test.ts` (PR #76). Sub-44px tap targets: an initial sweep reported 10; correcting for `<label>` forwarding the tap to a wrapped native control (a false-positive shape) found 8 real ones, all the same Bitácora tag-filter chips at `min-h-[36px]`, raised to 44px and guarded by `e2e/tap-targets.auth.spec.ts` on 13 real routes instead of the component catalog (PR #77) | cross-cutting accessibility |
| e2e added to CI | 2026-09-11 | `.github/workflows/ci.yml` gained an `e2e` job running the full Playwright suite against a throwaway stack (PR #69); before this the suite had never run anywhere but a developer's machine, which is how three separate PRs broke specs on green CI (see the job's own comment) | dev/operator experience |
| Feed entity tap-to-open | 2026-09-16 (PR #80) | The bitácora feed's linked-entity card is a real `<Link>`, scoped per viewer (see §2 3.10) | #3.10 |
| Character import/export round trip (e2e) | 2026-09-16 (PR #81) | `e2e/character-import-round-trip.auth.spec.ts` at 375px: exports via the real button, captures the browser download, re-imports that exact file, asserts draft-awaiting-approval at two UI layers | #3.9 |
| Feed keyset pagination | 2026-09-16 (PR #82 API, PR #83 web) | `apps/api/src/use-cases/world/feed-cursor.ts` (total order `sortAt DESC, sourceRank ASC, id DESC`, opaque base64url cursor); web client switched from `offset` to `cursor` | #3.10 |

---

## 5. Known Gaps / Not Yet Built

See `docs/ROADMAP.md §1` for the prioritized work plan. Summary (re-verified 2026-09-16):

MVP scope is done — every item in `definition.md §3` (#3.1–#3.10) is ✅. Everything below is a
real gap re-verified this sync, either pre-existing MVP-adjacent debt or newly discovered while
closing #3.10; none of it blocks the MVP declaration, and none of it should be papered over
because the MVP line is now clear.

| Gap | Severity | Definition.md item |
|---|---|---|
| ~~Character re-import — built, not deployed~~ — **shipped and live 2026-09-09; now e2e-tested.** `POST /characters/import` (domain validator, batched reference resolution, forced `draft` status) reached production with the API swap, and PR #20 released the web UI it was waiting on. The end-to-end flow — export via the real button, re-import that exact file, land as a draft awaiting DM approval — is now covered by an e2e round-trip spec (`e2e/character-import-round-trip.auth.spec.ts`, PR #81, run at 375px). It is **not** exercised against production: the spec runs against the CI throwaway stack, not the live API. World export ✅ shipped 2026-09-09 (`GET /worlds/:worldId/export`). | — | #3.9 |
| ~~WM knowledge layer — feed completeness~~ — **both remaining items closed this session.** Feed entity tap-to-open (PR #80): the linked-entity card is a real `<Link>`, scoped per viewer — see §2 3.10. Keyset pagination (PR #82 API + PR #83 web client): `apps/api/src/use-cases/world/feed-cursor.ts` plus the web client switching from `offset` to `cursor`. (Adventure board ✅ shipped 2026-09-09 at `/tablero`.) (Sealing/debunking UI ✅ shipped 2026-09-08.) (`NovedadesFeed` hookup and Mercado shipped 2026-09-03.) Closes #3.10 — the MVP is now 10/10. | — | #3.10 |
| ~~Biblioteca cross-category search~~ — **shipped 2026-09-08.** Search sheet on the landing fans out one request per category across all 8 (the landing grid shows 6; items and monsters are searchable but not gridded). Verified live against production: `fire` returns Fireball under Hechizos and Fire Opal under Items in one sheet. Partial failure names the categories that could not be reached instead of blanking. | — | #3.4 |
| ~~Map tiles 500 in production~~ — **fixed 2026-09-07.** Root cause was not missing files: all 1398 tiles were on the volume one directory level too deep (`<name>.jpg/<extra-uuid>/<version>` where Storage resolves `<name>.jpg/<version>`), so `FileBackend.getObject` raised `ENOENT` and the browser dropped the JSON error as `ERR_BLOCKED_BY_ORB`. The original tiles were extracted and re-uploaded via `apps/api/scripts/upload-map-tiles.ts` (1398/1398, 0 failures) rather than regenerated from source, which would have risked shifting POI alignment. Verified: tile serves `200 image/jpeg`, map renders with POIs in place. |  | #3.5 |
| ~~Map mobile zoom buttons~~ — **not a gap.** Verified live 2026-09-07 at a 390px viewport: `.leaflet-control-zoom` renders with both buttons visible. The prior "waypoint visibility model still open" claim in this row was also wrong (a hybrid status-gate model already exists in the `pois` schema). Both dropped. | — | #3.5 |
| **e2e coverage is Desktop Chrome only.** Every project in `apps/web/playwright.config.ts` (`chromium-public`, `chromium-auth`, `journeys`) uses `devices['Desktop Chrome']`. There is no mobile project, so a mobile-first app (CLAUDE.md §2) ships with zero e2e coverage at phone width — everything below the Playwright layer (component tests, manual/devtools checks) is what currently stands in for it. Closing it costs real CI time: the `e2e` job is already the longest in the workflow (~20–28 min locally per its own comment; the most recent run on `main` took 21.1 minutes, 164 passed / 8 skipped), and a second mobile project would run every spec a second time — roughly doubling that job. Not fixed this sync; recorded so the tradeoff is a decision, not a default. | Medium | cross-cutting (mobile-first, CLAUDE.md §2) |
| ~~`compendium-import` silently skips 34 of its 112 tests in CI~~ — **closed 2026-09-16.** The cause was two missing steps, not missing infrastructure: `verify` runs this package's suite, but `Cache the 5etools dataset` + `Fetch the 5etools dataset` existed only in `integration` and `e2e`. Its integration describes gate on `describe.skipIf(!existsSync(DATA_DIR))`, so three files (`fluff.integration.test.ts`, `seed-pack.smoke.test.ts`, `resolve-copy.integration.test.ts`) plus `importers/races.test.ts`'s real-data block — 34 tests — skipped on every run while the job reported green. The two steps were copied into `verify` with the same cache key, so a PR that warms the cache in either other job gets a hit. Verified before wiring it up that the 34 were skipped rather than broken: with the dataset present the suite is `112 passed (9 files)`, 0 skipped. Worth recording why it hid so long: this workflow's own header comment stated the dataset was "fetched fresh by both integration and e2e… that caveat only applies to a fresh local clone" — true of those two jobs, and quietly false about the third. | — | cross-cutting (`compendium-import`, CLAUDE.md §10) |
| **e2e tests report as skipped on `main`, and nobody audits which.** The `test.skip(true, 'reason')`-on-missing-precondition pattern is established in the repo (e.g. `uuid-bridge-npc.auth.spec.ts`), and it is not itself a defect — but a skip is a silent pass in a CI summary, indistinguishable at a glance from "not applicable this run" versus "the precondition it depends on quietly stopped holding." The most recent `e2e` run on `main` (2026-09-16, run id 35152047055) reports **8 skipped, 164 passed, 0 failed** in 21.1 minutes. Nobody currently audits which of the 8 are intentional (e.g. an ASI step that didn't appear at the level tested) versus evaporated coverage (a fixture or seed precondition that stopped being true). | Low | cross-cutting (e2e reliability) |

---

## 6. Deployment State

The two halves of this app ship by different routes, and only one of them is automatic.
Keeping that straight matters: the web half re-deploys itself and the API half does not, so the
two can drift apart silently — and did, for three months.

| Piece | Deploys | Currently running |
|---|---|---|
| `apps/web` | Automatically, on push to `main` (Vercel) | Current with `main` |
| `apps/api` | **Manually** — build an image on the home-lab VM and swap the container | Current with `main` (swapped 2026-09-09, swapped again 2026-09-16) |
| Supabase (Postgres, Auth, Storage, Kong) | Long-lived Docker Compose on the same VM | Schema current — 45 migrations, latest `0045` applied |

**The API was 24 commits and +2929 lines behind `main`** across `apps/api` and `packages/domain`
until 2026-09-09. The swap closed that: the image was rebuilt from `main`, verified against the
production database in a container without Traefik labels, and only then promoted. Proof it took
hold: `POST /characters/import` answered `404` before and answers `401` after.

The schema was never behind: migration `0045_engine_surprise_columns` was already applied
(`encounter_combatants.surprised` and `.first_turn_acted` both exist), so the swap was a
code-only deploy with no DDL. Verified before promoting: 45 applied, 45 in `meta/_journal.json`.

**A second swap on 2026-09-16 shipped keyset pagination (#3.10, PR #82).** Before this deploy the
container had been up 5 days on `dungeon-hub-app:latest`, and the only `apps/api` change between
that deploy and `main` was `apps/api/scripts/seed-e2e-fixture.ts` — a seed script, not runtime
code — so the API had been functionally at parity with `main` the whole time it sat undeployed.
This deploy was code-only: PR #82 adds no migration file, and migrations were re-verified before
promoting at **45 in the repo, 45 in `meta/_journal.json`, 45 applied in production**, the same
count as the previous sync. Proof it took hold used a different check than the `401`-vs-`404`
contrast above, because `#3.10`'s change is a new query param on an existing route rather than a
new route — see the addition to `docs/onboarding/api-deploy.md` for why that contrast doesn't
generalise and what was used instead.

Procedure, rollback and the traps involved are in
[`docs/onboarding/api-deploy.md`](./onboarding/api-deploy.md).

### Monitoring

`.github/workflows/uptime.yml` probes production every 15 minutes from GitHub's network — the
same public path a visitor takes, tunnel included — and mails the owner on failure. It checks
the web app, the API (requiring `"db":"up"`, not merely a 200), the Kong gateway, and one real
map tile (requiring an `image/*` content type, not merely a 200).

That last probe exists because the first version of this workflow read all-healthy while the
map was rendering nothing: a gateway that answers says nothing about the objects behind it.

### Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`: `pnpm lint`, then
`pnpm -r typecheck`, then the four suites that need no provisioned infrastructure plus the API's
unit lane — 3955 tests in total. Before 2026-09-09 the repository had no CI running tests at all;
`uptime.yml` was the only workflow, and it watches production rather than the diff.

`pnpm lint` is new too, and so is the linter behind it. The repository had none — the root
`"lint": "pnpm -r lint"` recursed into workspaces that defined no such script, so it exited green
without checking anything, which is worse than having no script at all. Biome now backs it, with a
deliberately narrow rule set (`biome.json`): Biome's own recommended set reports 1139 errors here,
but 982 of those are import ordering and 1095 are non-null assertions this codebase uses on
purpose. What is enabled instead is unused code, a short list of `suspicious` correctness rules,
and accessibility. `a11y/useValidAriaRole` is deliberately excluded: this codebase uses `role` as
a domain prop meaning DM-versus-player, which that rule misreads as an ARIA role, and "fixing" its
26 reports would mean breaking working code.

The 53 Playwright specs are **not** in CI yet, and that is deliberate. They had never
run anywhere either — their README asks a developer to start Supabase, the API and the web
in three terminals by hand — so `scripts/e2e-stack.sh` now does all of it and tears it down
after. First complete run, 2026-09-09: **105 passed, 12 failed, 2 flaky** in 25 minutes.

The 12 are UI assertions — "element not found", `toBeVisible`, `toHaveURL` — which is what
specs look like after months of the UI moving underneath them without anything running them,
though real defects may be mixed in; they need reading one at a time. Wiring the job before
they are fixed would give the repository a check that is red on arrival, which is how the
no-op `lint` script earned its irrelevance. It goes in once they are green.

A second job, `api integration`, runs the other 119 `apps/api` files — the ones that talk to a
live GoTrue + Postgres. `scripts/test-stack.sh` stands up a throwaway Postgres plus GoTrue pinned
to the version production runs, migrates, applies the custom SQL, imports the compendium and tears
the stack down; `scripts/fetch-5etools.sh` supplies the dataset, which is cached in CI. 1461 tests.

Standing that suite up for the first time immediately paid for itself. It had never run anywhere —
not on a fresh clone, not in CI — and it was hiding two real defects and a dead migration:

- **The surprise action-gate was missing from both spell paths.** `ACTOR_SURPRISED`
  (REQ-SUR-S2-02/03, PHB p.189) was wired into rage, contest and weapon-attack but never into
  `perform-cast-spell-apply` or `perform-spell-heal` — `git log -S` confirms it was never there.
  A surprised combatant could cast and heal on their first turn. Tests SUR-S2-02c/02d/03b had
  asserted otherwise since the day they were written.
- **`custom/0002-hexes-unique-nulls-not-distinct.sql` could not apply to any database.** It indexes
  `hexes.campaign_id`, a column migration `0031` drops; `0003` supersedes it. Following the
  documented setup steps in order failed on it every time. Deleted.
- Five race/sheet tests still sent High Elf without `raceCantrip`, predating the gate added in
  `c89ab66` (2026-05-24).

---

## 7. Section coverage

Every section of the app now has a working surface. That was the explicit goal:
a basic set everywhere first, depth afterwards.

| Section | Surface | State |
|---|---|---|
| Character builder + sheet | `/characters/*` | full |
| Biblioteca | `/compendium` | full, 8 categories + cross-category search |
| Mapa | `/mapa` | Leaflet tiles + POI CRUD |
| Mercado | `/mercado` + `/herramientas/tienda` | browse + buy, DM curation |
| Bitácora | `/bitacora` | guild feed, composer, sealing |
| **Tablero de anuncios** | `/tablero` | **basic — quests on offer** |
| Campañas + sesiones | `/campanas/*` | full |
| DM tools | `/herramientas/*` | facciones, NPCs, quests, tienda, contenido |
| **Contenido propio** | `/herramientas/contenido` | **basic — JSON upload (items), world export** |
| Import / export | `/characters/import`, `/herramientas/contenido` | character in/out, world out |
| Discord bot | `apps/bot` | 15 read-only commands |

The three marked basic are first slices, deliberately. What each defers is named
in `docs/ROADMAP.md` rather than left to be rediscovered: the board has no
claiming or signup, custom content covers items only, and the world export has no
matching import yet.

Combat (`/encuentros`) remains paused, not missing — see §2 3.11 and the freeze
note in §4.
