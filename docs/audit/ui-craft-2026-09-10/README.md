# UI craft audit — 2026-09-10 — findings + step-by-step remediation plan

> Status (2026-09-12): **every finding is applied.**
> F1, F2, F3, F5, F6, F7, F8, F9, F10, F11, F12, F13 are in production.
> F4 was re-measured and does not reproduce (see its section).
> Every number below is the *before*; each finding's PR carries the after.
>
> **F1** (#65, #66, #72): the nav chrome mounts once in the root layout instead of inside
> every page, and every authenticated route has a `loading.tsx`. The chrome nav now survives
> a navigation (0/4 → 4/4) and the destination skeleton paints at **100 ms** where the previous
> screen used to sit frozen for 1.6–3.2 s. The time to real content did not move — that is API
> latency and nothing here touches it.
>
> **F3** (#70, #73): 186 of 188 `text-[Npx]` are named tokens, a `text-label` (plain 10px) fills
> the gap the scale had, and the page title is `text-subhead` on mobile / `text-title` on desktop.
> The two holdouts are a character name at 28px, where `text-stat` would force `tabular-nums`.
>
> **F8** (#74): the heading half. The character sheet rendered the same name as an `h1` twice —
> topbar and hero — and so did the campaign and session detail pages. The action-stack
> regrouping is deliberately NOT done: it is a product decision about how discoverable a DM's
> destructive actions should be, and the finding itself offers two shapes. It wants a human.
>
> **Three findings the audit's own numbers got wrong**, all caught by re-measuring before acting:
>
> 1. **F3's histogram counted the persistent chrome once per route.** "33 % of visible text < 12 px"
>    was dominated by a six-label tab bar measured across seven pages. Separating chrome from page
>    content: `<12px` is **25.0 %**, not 42.4 %, and `≥16px` is **18.3 %**, not 13.6 %. There is no
>    9 px text in page content at all. And with chrome excluded, F3's target (`<12px ≤ 15 %`)
>    contradicts F3's own instruction to *keep eyebrows at 10 px* — both cannot hold.
> 2. **F4's `top-[120px]` drift was a live mobile bug, not desktop cosmetics.** The hex-list button
>    on `/mapa` sat 24 px under the header with `elementFromPoint` returning the header: it could
>    not be tapped. Fixed in #67 with a runtime-measured `--topbar-h`.
> 3. **The e2e suite never ran in CI**, so three craft PRs from this very audit each silently killed
>    a spec: F5 removed the subtitle `role-toggle` probed for, F9 dropped a full stop two specs
>    matched literally, F11 swapped `truncate` for `line-clamp-2` under a spec's selector. All
>    fixed in #68; the suite now runs in CI (#69) and found four more failures on its first run
>    that no local machine could see, because CI's database is clean.
>
> | | before | now |
> |---|---:|---:|
> | Forbidden raw Tailwind colours | 122 | **0** |
> | Solid `bg-white` | 19 | **0** |
> | Raw Tailwind shadows | 13 | **0** |
> | Off-scale radii | 145 | **0** |
> | Colour classes naming an undeclared token | 54 | **0** |
> | Tightest tabbar label gap at 6 columns | 3.5px | **18.5px** |
> | Routes with a truncated topbar title | 1 of 7 | **0 of 7** |
> | `/herramientas/tienda` targets under 44px | 61 | **1** |
> | Foreign font families on `/mapa` | 2 | **0** |
> | Files importing `V3Empty` | 10 | **34** |
>
> Guards now in place, each verified by reintroducing the defect and watching the test fail:
> `design-system-guard` (colours, shadows, radii, undeclared tokens), `type-scale-guard`
> (arbitrary `text-[Npx]`), `map-topbar-offset-guard` (hardcoded viewport offsets on the map),
> `route-chrome` (a new route with no declared chrome), and `e2e/headings.auth.spec.ts`
> (one `h1` per page). The first of them landed with F2 and grew through F12:
> `apps/web/lib/design-system-guard.test.ts`
> fails on a raw palette colour, a solid `bg-white`, a default Tailwind shadow, an off-scale
> radius, a colour class naming a token `globals.css` never declares, and a `@theme` token missing
> from `lib/design-tokens.ts`.
>
> Original status: **audit complete, nothing applied.** Read-only session on production `main = add83b3`
> (https://dungeon-hub.vercel.app, API redeployed by hand to the same commit). Mobile 375 px and
> desktop 1440 px measured with the same depth. This document is the working plan for the
> follow-up session(s): every finding carries what was measured, where it lives, the steps to
> fix it, the expected result, and how to re-measure it with the tools in `tools/`.
>
> Rendered report (same content, with the evidence inline): https://claude.ai/code/artifact/7fcd1698-aeff-424d-b49c-ef43dcd9677f
> Engram: checkpoint #3820 (`audit/ui-craft/2026-09-10`), plan `audit/ui-craft/2026-09-10/plan`.

---

## 0. Scope, method, and ground rules

**Goal.** Not bugs, not blockers: *craft*. Does navigating feel fluid and deliberate, and does the
product look professional? Findings are ranked by how much they move that perception, grouped by
root cause (one mechanism shared by 30 screens is one finding), and each names the mechanism.

**Method.**
- Playwright (Chromium 1223 already installed via `apps/web`) logged in with the public demo
  account (`DemoButton`, `demo@dungeon-hub.mnr.ar`). No mutating action was performed: the delete
  modal was opened and cancelled; long names were injected into the browser DOM only.
- 40 routes × 2 viewports: full-page + above-the-fold screenshots, plus per-page metrics: CLS
  (PerformanceObserver `layout-shift`), font-size histogram over visible text nodes, tap targets
  < 44 px, computed radii / shadows / font families, empty-state strings, `h1`s.
- Navigation continuity: click a tab, poll every 25 ms for the first visual acknowledgement and for
  the URL change; a DOM marker on `<nav>` and `<body>` tells whether the shell persisted.
- Static triage of arbitrary Tailwind values and raw colours with `rg` over `apps/web/app`,
  `components`, `lib` (tests and `app/dev/**` excluded).

**Rules for the follow-up session** (from the owner):
- Mobile first (CLAUDE.md §2), desktop with equal care.
- Measure before claiming; re-run the tools after each fix and paste the delta.
- One PR per finding (or per work unit inside a finding); small thematic commits; conventional
  commits; no `Co-Authored-By`.
- Do not widen scope into data pruning (compendium content) — that is a separate session.

---

## 1. Headline numbers

| Metric | Mobile 375 | Desktop 1440 | Note |
|---|---|---|---|
| Old page still on screen after a tab tap | **1.2–2.4 s** | **1.5–2.6 s** | filmstrips: `evidence/mobile-filmstrip.png`, `evidence/desktop-filmstrip.png` |
| Visual acknowledgement of the tap | 46–79 ms | 52–79 ms | 2 px `NavProgress` bar only |
| Shell (`<nav>`) persists across navigation | **no** | **no** | DOM marker lost; `<body>` kept |
| CLS (40 pages) | **0** | **0** | layout-shift theory discarded |
| Visible text < 12 px / < 14 px / ≥ 16 px | **33 % / 58 % / 7 %** | 21 % / 43 % / 9 % | 35 pages, visible text elements |
| Page `h1` size (topbar) | 15 px | 15 px | every page |
| Raw Tailwind colours forbidden by `globals.css` | 122 | — | `text-red-600` ×29, `bg-red-50` ×6, … |
| `bg-white` / `shadow-xl` | 19 / 5 | — | light-theme leftovers |
| Arbitrary values (`x-[…]`) excl. `dev/` | 686 | — | ~47 % legitimate, ~49 % debt, rest misc (§3) |
| Real raw hex in code (not comments) | ~11 sites | — | the 49 figure included issue refs like `#995` |
| Route-level `loading.tsx` / page Suspense | 0 / 0 | — | `AppShell` inline in 28 `page.tsx` |
| Network-idle load per route | 1.1–5.5 s | 1.2–6.8 s | median ≈ 3.5 s; API on the homelab |

---

## 2. Findings, ranked by perception impact

Each finding: **Today** (measured) · **Where** (file:line) · **Steps** · **Expected result** ·
**Verify**. Suggested branch names are hints, not mandates.

### F1 — Every tap freezes the previous screen for 1.2–2.4 s

> **Applied 2026-09-11/12 (#65, #66, #72).** Re-measured before starting: 1.6–3.2 s, worse than
> recorded here. Chrome nav persistence 0/4 → 4/4; destination skeleton at 100 ms on 4/4 routes,
> mobile and desktop; every authenticated route has a `loading.tsx` except `/dashboard`, which is
> a bare redirect. The route group this section proposes was measured and rejected — 147 files
> import via `@/app/...` and a route group would break all of them, while not being what fixes
> the freeze. The shell went to the root layout instead: 12 files, same measured outcome.

**Axis 3 (continuity). Mobile + desktop. Moves the needle the most.**

**Today.** The tap is acknowledged at 50–80 ms by a 2 px bar at the top (`NavProgress`). Then
nothing changes: the previous page stays intact and interactive until the full RSC payload
arrives. Mobile filmstrip after tapping *Bitácora* from `/inicio`: still `/inicio` at 59, 302,
702 and 1202 ms; switches at 1801 ms. Desktop: still `/inicio` at 1802 ms; switches at 2600 ms.

**Mechanism.**
- There is no `loading.tsx` anywhere under `apps/web/app`. The only `Suspense` is the one wrapping
  the progress bar in `app/layout.tsx:56`. Without a suspense boundary the App Router waits for
  the whole segment before painting, and `<Link>` prefetch on dynamic routes brings nothing
  useful (no `loading.tsx` to prefetch).
- `components/layout/app-shell.tsx:84-105` (`AppShell` = `DesktopSidebar` + `TopBar` + `<main>` +
  `TabBar`) is rendered **inside each of the 28 `page.tsx`**, not in a `layout.tsx`. Measured with
  a DOM marker: on every navigation the `<nav>` is destroyed and recreated (`nav: false,
  body: true`) even though it looks identical.
- `app/characters/[id]/wizard/layout.tsx` is the only nested layout (it does use `AppShell`).

**Steps.**
1. Introduce a route group for authenticated pages, e.g. `app/(app)/layout.tsx`, that renders
   `AppShell` once and receives `children`. Move the 28 authenticated `page.tsx` files under the
   group (URLs do not change). Pages that pass per-page shell props (`title`, `subtitle`,
   `backHref`, `rightAction`, `worldSwitcher`, `callerRole`, `showTabBar`) need a mechanism for
   the layout to know them: either (a) parallel/slot props via a small server-side "shell
   context" resolved from the route (`title` per segment), or (b) keep `TopBar` per page but
   lift `TabBar` + `DesktopSidebar` into the layout (they only depend on `callerRole`). Option
   (b) is the smaller first step and already keeps the two navigation surfaces mounted.
2. Add `loading.tsx` per segment with a skeleton that respects the page's shape (rows for lists,
   hero + 3 cells + tabs for the sheet, category grid for the compendium). Reuse the two existing
   skeleton patterns in `components/compendium/term/TermCard.tsx` and
   `app/compendium/[category]/_components/detail-sheet.tsx` as the visual reference. Base the
   skeleton on `bg-surface` / `bg-surface-soft` with a subtle pulse that respects
   `prefers-reduced-motion`.
3. Keep `NavProgress`; with a skeleton the bar becomes secondary feedback, not the only one.
4. Optional, after 1–2: `useLinkStatus` (Next 15.3+) on tab links for an immediate pressed state.

**Expected result.**
- Filmstrip: at ≤ 100 ms after the tap, the content area shows the destination skeleton and the
  shell has not moved; the URL changes at the same time as today (the API latency is unchanged).
- Nav marker test reports `nav: true` for the tabbar and the sidebar.
- No regression in `apps/web/e2e/journeys/*` (they rely on hydration timing; see CLAUDE.md §5
  "hydration race" notes and PR #52/#53).

**Verify.** `node tools/audit.mjs mobile` → `__nav[*].shellPersisted.nav === true`;
`node tools/filmstrip.mjs mobile` and `desktop` → frame at 300 ms shows the skeleton.

**Work units.** (1) lift `TabBar`/`DesktopSidebar` into a layout — one PR; (2) `loading.tsx` for the
5 tab destinations + `/personajes` + character sheet — one PR; (3) remaining routes — one PR.

---

### F2 — Light-theme leftovers inside the dark app: white modals, pink error boxes, raw reds

**Axis 1 (coherence). Mobile + desktop. Strongest "cheap" signal.**

**Today.**
- The delete-character confirm modal is `bg-white` and its title is `text-ink` (cream
  `rgb(244,234,213)` on white — unreadable). Evidence: `evidence/m-delete-modal.jpg`,
  `evidence/d-delete-modal.jpg`.
- The level-up error box is `bg-red-50 border-red-200 text-red-700` (a light-theme card).
- Counts outside `dev/`: 122 uses of colours the `globals.css` header (lines 22-24) forbids —
  `text-red-600` ×29, `text-red-500` ×5, `bg-red-50` ×6, `border-red-200` ×5, `border-red-800` ×4,
  `text-amber-700` ×4, `text-amber-400` ×4, `bg-amber-500` ×4, plus `bg-white` ×19,
  `text-white` ×26, `shadow-xl` ×5, `bg-black/50` ×1.
- Three hard-coded shadows carry a light-theme colour: `shadow-[0_12px_32px_rgba(39,30,51,0.25)]`
  in `components/wizard/review-banner.tsx:28` and `published-splash.tsx:25`; those two also use
  `to-[#1B1428]` (no token).

**Where (complete `bg-white` list).**
`app/characters/[id]/_delete-button.tsx:62` · `components/ui/pill.tsx:38,64` ·
`components/ui/progress-bar.tsx:20` · `components/sheet/sheet-hero.tsx:130` ·
`app/characters/[id]/_components/dm-grant-panel.tsx:266,362,479,485,528,642,648,795,800,947,952,1108,1114` ·
`app/characters/[id]/_components/inventory/picker.tsx:143`.
Error boxes: `app/characters/[id]/level-up/_flow.tsx:334` · `components/world/map/poi-accordion.tsx:177` ·
`app/characters/[id]/_tabs/_components/paginas-view.tsx:254` · `app/characters/[id]/_delete-button.tsx:41,92`.
Reference implementation that is already right: `components/ui/form-error-alert.tsx:16`
(`bg-danger-soft text-danger`).

**Steps.**
1. Delete modal: `bg-surface border border-line shadow-stamp-lg rounded-lg`; title `text-ink`;
   destructive button `bg-danger text-ink` (or `text-paper`), cancel `border-line text-ink-soft`;
   scrim `bg-paper/70`. Mobile keeps the bottom-sheet placement (`items-end sm:items-center`).
2. Replace every `text-red-*` / `bg-red-*` / `border-red-*` with `text-danger`, `bg-danger-soft`,
   `border-danger-soft-border`; every `text-amber-*` / `bg-amber-*` with `text-warning`,
   `bg-warning-soft`, `border-warning-deep`. Where a component needs a token that does not exist
   (e.g. `bg-danger` hover), add it to `@theme` **and** to `lib/design-tokens.ts` (they are
   mirrored; the file says so).
3. `bg-white` in `pill.tsx`, `progress-bar.tsx`, `sheet-hero.tsx`, `dm-grant-panel.tsx`,
   `picker.tsx`: check each — some are `bg-white/10` style overlays on gradients (acceptable
   as alpha) and some are solid; solid ones become `bg-surface` / `bg-paper-soft`.
4. `shadow-xl` ×5 and `shadow-md/lg` ×13 → `shadow-stamp-md` / `shadow-stamp-lg`; the two
   `rgba(39,30,51,…)` shadows → `shadow-stamp-lg`; `to-[#1B1428]` → `to-surface` (or add a
   `--color-surface-deep` token if the gradient end must be darker).
5. Add a guard so it cannot regress: a Vitest unit test in `apps/web/lib/` (or a Biome
   `noRestrictedImports`-style custom rule is not available for classnames, so a test) that
   greps `app/`+`components/` for `\b(bg|text|border|ring)-(red|amber|gray|zinc|slate|blue|green|yellow)-\d{2,3}\b`
   and `\bbg-white\b` and fails with the offending lines. Exclude `app/dev/**`.

**Expected result.** Test from step 5 passes with 0 hits. Delete modal screenshot: dark surface,
readable title, red only on the destructive button. `rg` count of forbidden colours = 0 outside
`dev/`.

**Verify.** `rg -o '\b(bg|text|border|ring|from|to)-(zinc|gray|slate|amber|blue|red|green|yellow|emerald|indigo|purple|neutral|stone|sky|rose|orange)-\d{2,3}\b' apps/web/app apps/web/components --glob '*.tsx' --glob '!*.test.*' --glob '!app/dev/**' | wc -l` → `0`;
`node tools/probe.mjs mobile` → `delete modal: { bg: <not white> }`.

**Work units.** (1) delete modal + error boxes (visible ones) — PR; (2) sweep of `dm-grant-panel.tsx`
(28 arbitrary values + 13 `bg-white`, the worst file) — PR; (3) shadows/gradients + regression
test — PR.

---

### F3 — The type scale is defined but not adopted: the app lives between 9 and 14 px

> **Applied 2026-09-12 (#70, #73).** 186 of 188 arbitrary sizes migrated, `text-label` added,
> page title raised to 19 px mobile / 22 px desktop (this section's own acceptance criterion).
> **The "Today" numbers below are wrong**: they count the persistent chrome once per route, so a
> six-label tab bar across seven pages dominates them. Content only: `<12px` **25.0 %**,
> `≥16px` **18.3 %**. There is no 9 px text in page content. And the target below
> (`<12px ≤ 15 %`) contradicts this section's own step 3 (*keep eyebrows at 10 px*).

**Axes 4 (hierarchy) + 5 (density). Mobile + desktop.**

**Today.** Mobile: 33 % of visible text < 12 px, 58 % < 14 px, only 7 % ≥ 16 px (histogram:
9 px 19 %, 10 px 12 %, 12 px 23 %, 14 px 32 %). Desktop: 21 % / 43 % / 9 %. The topbar `h1` is
`text-[15px]` on every page — at 1440 px "Personajes" is a 15 px title over a mostly empty screen.
Code: 291 `text-[Npx]` — 187 × `10px`, 33 × `9px`, 33 × `11px`, 10 × `13px`, 9 × `15px`,
5 × `17px`, 3 × `22px`, 2 × `28px`, 1 each × 30/26/19. 71 of the 187 `text-[10px]` sit next to
`uppercase` (eyebrows); 116 do not.

**Where.**
- `apps/web/app/globals.css:126-175` defines `text-eyebrow` (10 px bold uppercase 0.12em),
  `text-stat`, and the named scale `text-micro` (9) / `text-caption` (11) / `text-footnote` (13) /
  `text-body` (15) / `text-body-lg` (17) / `text-subhead` (19) / `text-title` (22) /
  `text-headline` (26) / `text-display` (30), with the comment
  "ADR-4 — define only; migration of `text-[Npx]` is follow-up".
- Missing: a plain 10 px token (the 116 non-eyebrow uses have nothing to migrate to).
- `components/layout/topbar.tsx:88` (`h1 … text-[15px]`), `:92` (subtitle `text-[10px]`
  `hidden sm:block`); `components/layout/tabbar.tsx:87` (`text-[9px]`).
- Tracking: 3 × `tracking-[0.08em]`, 2 × `tracking-[0.14em]`, 1 × `tracking-[0.06em]` — three
  different eyebrow trackings while `text-eyebrow` fixes 0.12em.

**Steps.**
1. Add `@utility text-label { font-size: 10px; line-height: 1.3; }` (plain 10 px) to
   `globals.css` and mirror it in `lib/design-tokens.ts` / the `/dev/catalog/tokens` page.
2. Migrate mechanically, one utility at a time, with `sd`:
   `text-[9px]`→`text-micro`, `text-[11px]`→`text-caption`, `text-[13px]`→`text-footnote`,
   `text-[15px]`→`text-body`, `text-[17px]`→`text-body-lg`, `text-[19px]`→`text-subhead`,
   `text-[22px]`→`text-title`, `text-[26px]`→`text-headline`, `text-[28px]`→`text-stat` (check
   each: `text-stat` also sets the display font), `text-[30px]`→`text-display`.
   `text-[10px]` + `uppercase` + `font-bold` → `text-eyebrow` (and drop the redundant
   `uppercase`/`tracking-*`/`font-bold`); remaining `text-[10px]` → `text-label`.
   The named utilities set `line-height` too — review anything that also sets `leading-*`.
3. Raise the hierarchy deliberately (this is the part that changes perception, the migration
   alone does not): topbar `h1` → `text-subhead` on mobile, `md:text-title` on desktop; section
   heads (`components/ui/section-head.tsx`) one step up; body copy in lists/cards `text-body`
   (15) rather than 14 px; keep eyebrows at 10 px but stop using them as running labels.
4. Tabbar labels: keep 9 px only if F6 is solved by shortening labels; otherwise 10 px.
5. Add the same regression test as F2 step 5 for `text-\[\d+px\]` (allow-list `dev/`).

**Expected result.** `rg -o 'text-\[\d+px\]' apps/web/app apps/web/components --glob '!app/dev/**' | wc -l` → `0`.
Mobile histogram: ≥ 16 px share ≥ 20 %, < 12 px share ≤ 15 %. Desktop `h1` ≥ 22 px.
Visually: a page title, a body, a label — three distinguishable levels in two seconds.

**Verify.** `node tools/audit.mjs mobile` / `desktop`, then the digest one-liner in §5 (font-size
histogram + `h1` sizes per page).

**Work units.** (1) tokens + regression test; (2) mechanical migration (one commit per utility);
(3) hierarchy pass on topbar/section heads/cards (the design decision, separate PR so it can be
reviewed on screenshots).

---

### F4 — Desktop is the mobile layout centred at 768 px, with different widths per page

**Axis 4 (hierarchy). Desktop.**

**Today.** Personajes, Campañas, Tablero, Ajustes use ~10 % of a 1440 px viewport. Mercado and
Mapa narrow further (~350 px column). The Leaflet map does not fill its container (a ~310 px
image floating in a 1200 px area). The character sheet keeps the three-cell 375 px grid.
Evidence: `evidence/d-mercado.jpg`, `evidence/d-map.jpg`, `evidence/d-personajes.jpg`,
`evidence/d-sheet.jpg`.

**Where.**
- `components/layout/app-shell.tsx:96`: `<main className="mx-auto min-h-screen max-w-sm px-4 py-4 pb-28 md:max-w-3xl md:pb-8">`.
- `app/mapa/page.tsx` and `app/mercado/page.tsx` add `max-w-sm`; `app/characters/[id]/level-up/page.tsx` `max-w-lg`; `app/encuentros/[id]/page.tsx` mixes `md` and `3xl`.
- `components/world/map/world-map-leaflet.tsx:248` (`fixed inset-x-0 top-[120px] md:left-[var(--sidebar-w)]`) and `map-client-wrapper.tsx:38,84,111,148` (`top-[120px]` ×4).

**Steps.**
1. Decide three content widths and name them as tokens: reading (`max-w-3xl`, sheet/campaign
   detail/forms), list (`max-w-4xl`/`5xl`, Personajes/Mercado/Bitácora/Compendium), canvas (full
   width minus sidebar: Mapa). Put the choice in `AppShell` as a `width` prop with a default,
   remove per-page `max-w-*` overrides.
2. Lists on desktop: two columns for cards (Personajes, Campañas) or a list + detail split
   (Compendium category → detail sheet becomes a side panel ≥ 1024 px). Start with Personajes and
   Mercado; they are the emptiest.
3. Map: on `md+` fill the content area (`fitBounds` on mount, container `h-[calc(100dvh-<topbar>)]`);
   replace the four `top-[120px]` with a `--topbar-h` / `--map-toggle-h` token so the offset
   cannot drift from the real topbar height.
4. Character sheet on desktop: vitals grid stays 3-up but the sections below (Atributos,
   Identidad, Salvaciones, Secundarios, Competencias) can go 2-column at `lg`.

**Expected result.** Screenshots at 1440 px: no page where content occupies < 40 % of the
width; sibling routes (Mercado vs Bitácora) share the same width; map fills the area.
`rg -c 'max-w-(sm|md|lg)' apps/web/app --glob 'page.tsx'` → only intentional cases (auth/invite/link/dev).

**Verify.** `node tools/audit.mjs desktop`, then `node tools/sheet.mjs desktop out.png 700 2 mercado.fold.png mapa.fold.png personajes.fold.png`.

---

> **Re-measured 2026-09-11, after F2/F5/F6/F7/F9/F10/F11/F12 landed: this finding does not
> reproduce, and the one attempt to act on it made things worse.**
>
> *Widths.* Content width at 1440px is 736–768px on every route — 51–53% of the viewport, and
> every route shares 768px. The expected result below asks for "no page where content occupies
> < 40%" and "sibling routes share the same width". Both already hold. The "~10%" figure is not
> reproducible against this code. The three named width tokens and the two-column list layouts
> would be new design work on top of a layout that already passes, not a fix.
>
> *Map fill.* The container does fill its area: 1200 × 707 at 1440px, 375 × 619 at 375px.
> The image inside it covers 64% × 72% of that on desktop and spans the full width on mobile.
> A `fitBounds` on mount was tried, on the theory that a fixed initial zoom was the cause. It
> measured **worse**: mobile vertical fill fell from 83% to 41%, and the map became the small
> picture floating in black that this finding describes. Fitting the whole image into a tall
> narrow container necessarily letterboxes it. Reverted; see PR #63.
>
> What is left here is genuine design work — two-column lists, a list/detail split, a desktop
> sheet layout — and it needs a design decision, not a measurement.

---

### F5 — The mobile topbar truncates what matters most: the world always reads "La Campañ…"

**Axis 5 (density). Mobile.**

**Today.** At 375 px the topbar holds four controls: world pill, title, role switch, avatar. The
pill is capped at `max-w-[88px]`, so the world name is cut on **every** measured page (7/7); on
Herramientas the title is cut too ("Herrami…"). The pill is 32 px tall — the only shell control
under 44 px, on every page. Evidence: `evidence/m-topbar-cut.jpg`.

**Where.** `components/layout/world-switcher.tsx:55`
(`truncate max-w-[88px] sm:max-w-[120px]`), `:130-137` (sheet rows are ≥ 44 px, fine);
`components/layout/topbar.tsx:84-92`.

**Steps.**
1. Pick one: (a) the world becomes the subtitle line under the title (the subtitle slot exists at
   `topbar.tsx:92` and is hidden on mobile today — flip it: show world on mobile, keep the eyebrow
   on desktop), and the left slot returns to the CrowMark/back arrow; or (b) keep the pill but
   let it take the remaining width (`min-w-0 flex-1`) and let the *title* be the one that
   truncates only when unavoidable. Recommendation: (a) — the title identifies the screen, the
   world is context.
2. Pill height ≥ 44 px (`min-h-[44px]`), or make the whole subtitle line the tap target.
3. Never truncate two things in the same bar: if both the title and the world cannot fit, the
   world drops to the sheet only.

**Expected result.** `node tools/probe.mjs mobile` → `topbar truncation:` all `pillCut: false`
(or `null` when the pill is gone) and `titleCut: false` on the 7 sampled routes; `pillH ≥ 44`.

---

### F6 — Six-column tabbar: "Mercado" and "Bitácora" sit 3.5 px apart

**Axis 5 (density). Mobile, GM view.**

**Today.** With the sixth "Mesa" tab each column is 60.5 px. Measured label gaps at 6 columns:
Inicio→Mapa 26.8, Mapa→Códex 25.1, Códex→Mercado 13.8, **Mercado→Bitácora 3.5**, Bitácora→Mesa 15.3 px.
At 5 columns: 38.9 / 22.8 / 11.5 / 15.5. The code already swaps "Biblioteca"→"Códex" at 6 columns
(`tabbar.tsx:11-18`), which fixed one collision and left the next one. Label widths at 9 px
uppercase 0.06em: Mercado 55.8, Bitácora 58.3 px. Evidence: `evidence/m-tabbar-6.jpg`,
`evidence/m-tabbar-5.jpg`.

**Where.** `components/layout/tabbar.tsx:35-41` (labels), `:86-88` (`text-[9px] font-bold uppercase tracking-[0.06em]`).

**Steps.** Choose one:
1. Enforce a minimum gap by construction: `px-1` on each link and `truncate` on the label, with
   short labels for *all* tabs at 6 columns (e.g. "Bitác." is not acceptable — prefer real short
   names: Inicio · Mapa · Códex · Tienda · Diario · Mesa), or
2. Label only on the active tab (icon-only inactive tabs with `aria-label`), which also frees
   room to raise the label to 10–11 px, or
3. Drop uppercase on tab labels (mixed case is ~15 % narrower at the same size).
Whatever the choice, keep `aria-current`, ≥ 44 px link height (currently 50 px), and update
`tabbar.test.tsx`.

**Expected result.** `node tools/tabbar.mjs` → every gap ≥ 8 px at 5 and at 6 columns; no label
`overflow: true`.

---

### F7 — The HP edit pencil covers the "Puntos de golpe" label

**Axis 4 (hierarchy). Mobile + desktop.**

**Today.** The circular edit button overlaps the label of the HP cell in both viewports; it reads
"PUNTOS DE GOL". Evidence: `evidence/m-hp-pencil.jpg`, `evidence/d-hp-pencil.jpg`.

**Where.** `components/sheet/vital-grid.tsx:66-76` — `hpEditorSlot` is passed inside `footer` of a
`StatCell size="compact"`; `components/ui/stat-cell.tsx:78` makes the cell `relative` so slot
content can be absolutely positioned. The editor island is in `components/ficha/hp/`.

**Steps.**
1. Give `StatCell` an explicit `action` slot rendered in the top-right corner with reserved
   padding on the label (`pr-9` when `action` is present), instead of absolutely positioning
   through `footer`.
2. Or move the pencil to the value row (right of `12 / 12`), which has spare width in the compact
   cell.
3. Add a component test that asserts the label and the action button do not overlap
   (`getBoundingClientRect` in jsdom is limited — assert on classes/structure, and rely on the
   screenshot for the visual check).

**Expected result.** The full label is legible at 375 px; the pencil keeps ≥ 44 px tap area.
Note: this is a cousin of the J6 e2e fix (engram: "the HP pencil rendered outside its cell,
covered by the topbar") — check `e2e/journeys/j6-gm-owner.auth.spec.ts` still passes.

---

### F8 — On the sheet, five actions weigh the same and the name is an `h1` twice

> **Applied 2026-09-12 (#74 heading, #78 actions).** The duplicate `h1` is fixed and guarded by
> `e2e/headings.auth.spec.ts`: measured on production, the sheet rendered the character's name
> as an `h1` twice (15 px topbar + 24 px hero), and the campaign and session detail pages did the
> same.
>
> The action stack was regrouped in #78 after Mauricio chose between the two shapes step 1 offers:
> the DM affordances sit in a `Como DM` disclosure that opens when the character is
> `pending_approval` and stays closed otherwise. Tabs moved from y=798 to y=738 at 375px — 60px,
> and **still below a 667px fold**, because the hero and vitals grid occupy most of the viewport
> before any action appears. Lifting them needs a smaller hero, which is not this finding.
>
> **Two things worth knowing before touching this again.** First, this section's "Today" lists
> FIVE controls, not four: `+ Agregar clase` is still full-width below the disclosure. It is a
> *player* action, so it does not belong under `Como DM`, and which of a player's actions should
> be primary is a question this finding never asked. Second, shipping the disclosure closed
> unconditionally broke seven DM journeys — approvals are the hot path, not an edge — and
> `<details open={expr}>` is a CONTROLLED attribute in React, so a bare expression there yanks the
> section shut the instant approval flips the status. Neither is visible from the source alone.

**Axis 4 (hierarchy). Mobile + desktop.**

**Today.** Between the vitals and the tabs there is a stack of full-width buttons: "Descanso
corto / largo", "Devolver a borrador" (gold), "Otorgar" (cyan), "+ Agregar clase". On desktop the
widths diverge: "Devolver a borrador" small and left-aligned, "Otorgar" full width. The
character name is an `h1` in the topbar (15 px) and again in the hero (24 px) 100 px below; the
campaign page repeats the pattern. Evidence: `evidence/m-action-stack.jpg`,
`evidence/d-action-stack.jpg`.

**Where.** `app/characters/[id]/_components/approval-actions.tsx` (DM actions),
`app/characters/[id]/_components/level-up-entry-point.tsx` ("Agregar clase"), rest buttons in the
sheet page, `components/sheet/sheet-hero.tsx:67` (`h1 text-2xl … truncate`),
`components/layout/topbar.tsx:88` (`h1`), `components/campanas/campana-detail-view.tsx:75`.

**Steps.**
1. One primary action per screen. For a player: none of the DM actions render (verify the
   `callerRole` gate — the demo account is GM so the screenshot shows the DM set). For the DM:
   group "Devolver a borrador" + "Otorgar" + "Agregar clase" under a "Como DM" section or an
   overflow menu in the topbar `rightAction`; keep rests as a compact two-button row.
2. Consistent widths: buttons in the same group share a grid (`grid-cols-2`) or are all
   full-width; never mixed.
3. One `h1`: when a hero exists, the topbar renders its title as `<p>` (or `h2` visually
   identical) and shows it only after scrolling past the hero (`IntersectionObserver`, or simply
   keep it static but not an `h1`). Same in `campana-detail-view.tsx`.

**Expected result.** `node tools/audit.mjs` → `h1` array has one entry per page. Screenshot:
one highlighted CTA at most, DM actions visually subordinate.

---

### F9 — Empty states: the primitive exists and teaches, adoption is partial; there is no skeleton anywhere

**Axis 2 (unhappy states). Mobile + desktop.**

**Today.** Good: `V3Empty` (`components/ui/empty.tsx`) on Encuentros, Eventos, NPCs, Facciones
says "Todavía no hay X — Tocá el botón + para crear el primero." with a CTA. Pending:
"Sin grants recientes." and "Aún no consultaste ninguna entrada." are bare paragraphs; 63 files
contain an ad-hoc "No hay… / Todavía no… / Aún no…" string. Loading: the word "skeleton" appears
in two files (`components/compendium/term/TermCard.tsx`, `app/compendium/[category]/_components/detail-sheet.tsx`),
none at page level; `animate-spin` = 0. There is no loading state at all beyond the 2 px bar
(→ F1). Evidence: `evidence/m-empty-good.jpg` vs `evidence/m-empty-bare.jpg`.

**Where.** `V3Empty` importers (10): `components/encuentros/encuentros-list-view.tsx`,
`app/herramientas/{facciones,quests,npcs,tienda}/page.tsx`, `app/personajes/page.tsx`,
`app/bitacora/page.tsx`, `app/bitacora/notas/page.tsx`, `components/world/guild-bitacora/guild-bitacora-feed.tsx`,
`app/dev/catalog/components/_registry.tsx`. Bare ones seen in prod:
`app/characters/[id]/_components/recent-grants.tsx` ("Sin grants recientes."),
`app/compendium/page.tsx` ("Más consultado"), `app/characters/[id]/_tabs/notas.tsx` /
`conocidos-view.tsx` ("Aún no conocés ningún monstruo…"), `components/campanas/sessions/session-detail-view.tsx:135`,
`event-timeline.tsx:60`, `join-sheet.tsx:128`, `components/world/map/poi-map-drawer.tsx:126`,
`components/encuentros/attack-sheet-view.tsx:127`, `components/layout/world-switcher.tsx:112`.

**Steps.**
1. Inventory the 63 strings (`rg -n 'No hay |Todavía no|Aún no|Sin ' apps/web/app apps/web/components --glob '*.tsx' --glob '!*.test.*'`)
   and classify: page-level empty → `V3Empty` with glyph + title + sub + CTA; inline/section
   empty (e.g. inside a card) → a smaller `V3Empty` variant (`size="inline"`: icon 20 px, one
   line, optional link) to add to `empty.tsx`.
2. Every empty answers "what do I do now": a CTA or a sentence naming the action and where
   ("El DM puede otorgarte conocimiento desde su panel" is a good example; "Sin grants recientes."
   is not).
3. Skeletons are F1 step 2.

**Expected result.** No bare empty paragraph on any captured page (`emptyish` in metrics only
lists strings that come from `V3Empty`); `V3Empty` importers ≥ 25 files.

---

### F10 — Native and third-party controls left unthemed: Leaflet, "Choose File", 16 px checkboxes

**Axis 1 (coherence). Mobile + desktop.**

**Today.**
- Map: Leaflet's white zoom buttons (30 × 30 px) and the "Leaflet | Sword Coast — Forgotten
  Realms" attribution on a white strip. There is no `.leaflet-control` / `.leaflet-bar` /
  `.leaflet-control-attribution` override anywhere in `apps/web`. Fonts "Lucida Console" and
  "Helvetica Neue" show up in the computed-font census only because of Leaflet.
- Character import: a native `<input type="file">` renders "Choose File / No file chosen" in
  English inside a Spanish UI.
- DM shop (`/herramientas/tienda`): 62 native checkboxes at 16 × 16 px in a 200-item list.
- Mercado: native `<select>` for the type filter.
Evidence: `evidence/m-map-leaflet.jpg`, `evidence/m-file-input.jpg`, `evidence/m-tienda-checkbox.jpg`.

**Where.** `components/world/map/world-map-leaflet.tsx` (+ its CSS import),
`app/characters/import/_form.tsx:162-166`, `app/herramientas/tienda/` (row checkboxes),
`app/mercado/page.tsx` (select).

**Steps.**
1. Leaflet: add a scoped stylesheet (or `@layer components` block in `globals.css`) themed with
   tokens: `.leaflet-bar a { background: var(--color-surface); color: var(--color-ink);
   border-color: var(--color-line); width/height: 44px }`, attribution on `bg-paper/80` with
   `text-ink-mute` 10 px, or move attribution into the map drawer.
2. File input: hide the native control (`sr-only`) behind a labelled `Button` ("Elegir archivo…")
   and show the chosen file name in the existing `fileName` paragraph; keep `accept` and the
   `id`/`htmlFor` pairing.
3. Checkboxes: wrap each row as a `<label>` with `min-h-[44px]` and style the box via
   `accent-[var(--color-accent)]` (already used in 3 places) or a custom `ToggleChip`
   (`components/ui/toggle-chip.tsx` exists) — the row, not the 16 px box, is the target.
4. Select: style with the same border/background/radius as `FormInput`; native behaviour is fine,
   native look is not.

**Expected result.** `node tools/audit.mjs mobile` → `/herramientas/tienda` `smallTargetCount`
drops from 62 to ≤ 1; `/mapa` small targets ≤ 1 (the "Cerrar lista" 40×6 handle, see §4);
computed font census contains only the four project families; import screen shows Spanish copy.

---

### F11 — A 60-character name clips the character card without an ellipsis

**Axis 2 (unhappy states). Mobile + desktop.**

**Today.** DOM-only simulation with "Thalindra Voss-Ravenwood de la Casa Argéntea del Norte
Helado": in the list the name runs past the card's right edge and pushes the status chips out of
view, with no "…". The topbar and the sheet hero do truncate (one line, ellipsis). Evidence:
`evidence/m-longname-card.jpg`, `evidence/m-longname-sheet.jpg`.

**Where.** `components/ui/character-card.tsx:67` (wrapper `flex overflow-hidden …`), `:80`
(text column `min-w-0 flex-1` — the name node inside has no `truncate`/`line-clamp`). Chips row
in the same component.

**Steps.**
1. Name: `line-clamp-2` (wrapping is preferable to truncation per the UX guideline) with
   `text-wrap: balance` off; fallback `truncate` if the card height must stay fixed.
2. Chips row: `flex-wrap` so chips never depend on the name's width.
3. Add a test in `character-card.test.tsx` rendering a 60-char name and asserting the clamp class
   and that all chips render.
4. Same check on `components/ui/list-row.tsx` and `quest-row.tsx` (not measured; verify).

**Expected result.** `node tools/probe.mjs mobile` → `probe_longname_list.png` shows the name on
two lines and all chips visible.

---

### F12 — Radii and shadows off the scale, and two names for the same pill

**Axis 1 (coherence). Minor.**

**Today.** Scale is 8 / 12 / 18 / pill. In code (excl. `dev/`): 32 bare `rounded` (4 px),
5 `rounded-2xl` (16 px), 9 `rounded-[…]` (12 ×4 — equals `md` — plus 5, 9, 10, 14, 24 px),
48 `rounded-xl` (12 px, coincidentally on-scale), `rounded-full` ×77 vs `rounded-pill` ×17 for the
same value, 305 on-scale `rounded-sm/md/lg`. Shadows: 13 Tailwind `shadow-sm/md/lg/xl` next to
the `stamp` scale. Computed on desktop: 12 px ×538, pill ×206, **4 px ×53**, 8 px ×52, 18 px ×13,
16 px ×8, 10 px ×7.

**Steps.**
1. `rounded` (bare) → `rounded-sm`; `rounded-2xl` → `rounded-lg`; `rounded-xl` → `rounded-md`
   (same value, on-vocabulary); `rounded-[12px]` → `rounded-md`; other `rounded-[…]` case by case.
2. Pick one pill name (`rounded-pill` is the documented one) and migrate `rounded-full`, except
   true circles (avatars, dots) where `rounded-full` reads better — decide and document in the
   `globals.css` header.
3. `shadow-sm/md/lg/xl` → `shadow-stamp-*`; extend the F2 regression test with
   `\brounded(-2xl|-xl)?\b(?!-)` and `\bshadow-(sm|md|lg|xl|2xl)\b`.

**Expected result.** Computed radii census: only 8 / 12 / 18 / pill (+ 50 % circles).

---

### F13 — Inicio "Atajos DM": only the first icon has a circular background

**Axis 1 (coherence). Minor.**

**Today.** "Iniciativa" carries a filled circle behind the icon; "Herramientas", "Mesa",
"Nuevo NPC", "Loot" do not — via a one-off class `inicio-quick-iniciativa-ic`.
Evidence: `evidence/m-atajos.jpg`.

**Where.** `components/inicio/dm/dm-quick-actions.tsx:27` vs `:38` (and the following items).

**Steps.** Give all five the same treatment; if "Iniciativa" is primary, express it by position
(first) or size, not by a unique style. Remove the one-off class (check `globals.css` for its
definition) and update `dm-quick-actions.test.tsx`.

**Expected result.** Five identical icon treatments in the screenshot.

---

## 3. Axis 1 triage — the 686 arbitrary values

Counted over `apps/web/app` + `components` + `lib`, `*.tsx`/`*.ts`, excluding tests and `app/dev/`.
The owner's baseline of 656 differs by glob; the split is the same. ~47 % legitimate, ~49 % debt
with a nameable root cause, the rest miscellaneous. **This is not a list of 686 things to fix.**

| Pattern | Uses | Verdict | Why |
|---|---:|---|---|
| `min-h-[44px]` · `min-w-[44px]` · `w-[44px]` | 293 | Legitimate | Deliberate tap targets. Could be a `min-h-tap` utility; not design debt. |
| `text-[Npx]` | 291 | Debt → F3 | Scale exists in `globals.css`; missing plain 10 px token + migration. |
| `top-[120px]` · `left-[var(--sidebar-w)]` | 8 | Legitimate, tokenise → F4 | Documented map offset (topbar + toggle). Should be a token so it cannot drift. |
| `shadow-[…]` | 13 | Mixed → F2 | 6 glows with `var(--color-accent)` (fine); 3 light-theme colour shadows; 4 ad-hoc elevations. |
| `rounded-[Npx]` | 9 | Debt → F12 | 4 are `12px` = `rounded-md`; rest off-scale. |
| `text-[#1A1208]` ×3 · `to-[#1B1428]` ×2 · `bg-[linear-gradient…]` ×2 · `bg-[…]` | 8 | Debt → F2 | `#1A1208` is already `text-on-accent`. |
| `tracking-[…]` | 6 | Debt → F3 | Three eyebrow trackings; `text-eyebrow` fixes 0.12em. |
| `min-h-[28\|32\|36px]` | 12 | Debt → §4 chips | Chips/toggles under 44 px (Bitácora filters 36, Inventario 33). |
| `max-h-[92vh]` · `max-h-[85vh]` · `w-[34px]` · `h-[34px]` · `min-w-[3rem]` · `w-[375px]` · … | ≈46 | Misc | Sheets, icon boxes, one preview width. No pattern worth a finding. |

**Raw hex.** Outside `globals.css`, `dev/` and the intentional mirror `lib/design-tokens.ts` (25),
~11 real sites remain: `app/characters/[id]/_components/inventory/v3-list/currency-strip.tsx` (3),
`components/world/map/map-marker-icon.ts` (5), `components/ui/crow-mark.tsx:11`,
`components/ficha/atributos-editor.tsx:144` (`text-[#1A1208]`), the two wizard gradients. The
49 figure included issue references in comments (`#995`, `#1953`, …).

**Worst file** `app/characters/[id]/_components/dm-grant-panel.tsx`: 28 arbitrary values +
13 `bg-white` — handle as one work unit inside F2/F3.

---

## 4. Secondary measurements worth fixing while nearby

Tap targets < 44 px seen in production (excluding the shop checkboxes, F10):
- World switcher pill 141 × 32 (mobile) / 173 × 32 (desktop) on every page → F5.
- Filter chips: Bitácora 36 px tall (`components/world/guild-bitacora/tag-filter.tsx`), Inventario
  33 px (`app/characters/[id]/_components/inventory/v3-list/type-filter-chips.tsx`) — raise to 44
  or extend the hit area with padding.
- `← Salir` link 39 × 16 in `characters/new` and `campanas/new` (wizard layout / topbar `rightAction`).
- `Eliminar personaje` 130 × 20 (`_delete-button.tsx:41`).
- Map "Cerrar lista" drag handle 40 × 6 (`components/world/map/poi-map-drawer.tsx`) — a handle is
  acceptable if the sheet also dismisses by tapping outside; verify.
- Settings "Modo desarrollador" toggle 36 × 20 (`components/codex/dev-mode-toggle.tsx`).
- `characters/import` input 36 px tall.

Spacing rhythm (utility histogram): 8 px-based values dominate (`2`:533, `3`:461, `4`:316,
`1`:236, `6`:66), but off-rhythm half-steps account for ~13 % (`0.5`:75, `1.5`:98, `2.5`:60,
`3.5`:9). Not a finding on its own; when touching a component, snap to 4/8/12/16/24.

Compendium `races` lists Dragonborn colours as top-level rows (Black/Blue/Brass/… ) — that is
data, not UI; belongs to the planned data-pruning session.

---

## 5. Theories tested and discarded

- **Layout shift on data load** — CLS = 0 on all 40 pages, both viewports. Server components
  paint complete; no later reflow.
- **Bare spinners** — none exist (`animate-spin` = 0). The problem is the absence of loading UI,
  not ugly loading UI (F1).
- **Tap acknowledgement latency** — 46–79 ms, under the 100 ms threshold. What happens next is
  the problem.
- **Horizontal scroll at 375 px** — none on any route.
- **Font loading** — four families load with `display: swap` and are in use; only Leaflet
  injects foreign families (F10).
- **200-item lists** — compendium (499 spells) and shop (200+ items) render without
  virtualisation and without visible issues in the capture; the debt there is tap targets, not
  performance.

---

## 6. Tools — how to re-measure

All scripts live in `tools/` and write to `$AUDIT_OUT` (default `os.tmpdir()/dungeon-hub-ui-audit`).
They use `@playwright/test` from `apps/web/node_modules` (Chromium already installed). They log
in with the public demo account and perform **no mutating action**.

```bash
cd docs/audit/ui-craft-2026-09-10/tools
export AUDIT_OUT=/tmp/dh-audit            # optional
export AUDIT_BASE=https://<preview>.vercel.app   # optional: measure a branch preview

node audit.mjs mobile      # 40 routes: shots/mobile/*.png + metrics.json (+ nav continuity test)
node audit.mjs desktop
SKIP_CAPTURE=1 node audit.mjs mobile      # nav test only (reuses metrics.json)
node probe.mjs mobile      # delete modal, long names on real nodes, topbar truncation
node tabbar.mjs            # label gaps at 5 and 6 columns (mobile)
node filmstrip.mjs mobile  # 6 frames after tapping Bitácora → evidence-style PNG
node filmstrip.mjs desktop
node sheet.mjs mobile out.png 375 4 inicio.fold.png personajes.fold.png   # contact sheet
node crop.mjs              # regenerates evidence tiles from crops.txt into $AUDIT_OUT/evidence
node build-report.mjs      # rebuilds the HTML report from report.tpl.html + evidence
```

Digest of `metrics.json` (font-size histogram, sub-12/14 px share, small targets per page):

```bash
node -e '
const m=JSON.parse(require("fs").readFileSync(process.env.AUDIT_OUT+"/shots/mobile/metrics.json"));
const agg={};let tot=0;for(const [r,v] of Object.entries(m)){if(r.startsWith("__")||!v.sizes)continue;for(const [fs,c] of Object.entries(v.sizes)){agg[fs]=(agg[fs]??0)+c;tot+=c;}}
const sub=n=>Math.round(Object.entries(agg).filter(([k])=>+k<n).reduce((s,[,v])=>s+v,0)/tot*100);
console.log(agg,`sub12=${sub(12)}% sub14=${sub(14)}% ge16=${100-sub(16)}%`);
for(const [r,v] of Object.entries(m))if(v.h1)console.log(r,"h1:",v.h1.map(h=>h.fs).join(","),"small:",v.smallTargetCount,"cls:",v.cls);'
```

Static counters used in this audit (run from `apps/web`):

```bash
# arbitrary values, by exact value
rg -o '\b[a-z-]+-\[[^\]]+\]' app components lib --glob '*.tsx' --glob '*.ts' --glob '!*.test.*' --glob '!app/dev/**' | sd '^[^:]+:' '' | sort | uniq -c | sort -nr
# forbidden raw colours
rg -o '\b(bg|text|border|ring|from|to)-(zinc|gray|slate|amber|blue|red|green|yellow|emerald|indigo|purple|neutral|stone|sky|rose|orange)-\d{2,3}\b' app components --glob '*.tsx' --glob '!*.test.*' --glob '!app/dev/**' | wc -l
# real hex (not comment lines)
rg -n '#[0-9a-fA-F]{6}\b' app components lib --glob '*.tsx' --glob '*.ts' --glob '*.css' --glob '!globals.css' --glob '!*.test.*' | rg -v '^\S+:\d+:\s*(//|\*|/\*)'
# radius vocabulary
rg -o '(?<![\w-])rounded(?![\w-])' -P app components --glob '*.tsx' --glob '!*.test.*' --glob '!app/dev/**' | wc -l
```

Gotchas learned while building the tools: `file://` images do not load inside a Playwright
`setContent` page (use base64 data URIs); `sd` treats `$` in the replacement as a capture
reference; `offsetParent` is `null` for `position: fixed` elements (use
`getBoundingClientRect`); the first `audit.mjs` nav test matched the hidden desktop sidebar link —
use `:visible`.

---

## 7. Suggested execution order

The ranking is by perception impact; execution can differ because F1 and F3 are the largest
and F2/F7/F13 are quick wins with visible payoff. Proposed sequence, one PR each unless noted:

1. **F2** (light-theme leftovers) — delete modal + error boxes first (visible), then the
   `dm-grant-panel.tsx` sweep, then the regression test. Small diff per commit, high payoff.
2. **F7** (HP pencil) and **F13** (Atajos) — one small PR each.
3. **F1** (shell in a layout + `loading.tsx`) — the structural one; do it while the e2e suite is
   green so hydration-timing regressions show up immediately. Run the full e2e
   (`scripts/e2e-stack.sh`, ~20 min) before merging.
4. **F3** (type scale) — tokens + mechanical migration commits, then the hierarchy PR reviewed on
   screenshots (mobile + desktop).
5. **F5 + F6** (mobile topbar/tabbar) — one PR; they share the 375 px budget.
6. **F9** (empties) + **F11** (card clamp) — one PR.
7. **F10** (Leaflet / file input / checkboxes / select) — one PR.
8. **F4** (desktop widths) — one PR per page family; last because it is the least mobile-first
   and the most design-decision-heavy.
9. **F12** (radii/shadows) — mechanical, can ride along with F3's regression test.

After each PR: re-run `audit.mjs` for the affected viewport and paste the before/after numbers
into the PR description (the ones listed under *Expected result*). Update `docs/STATUS.md` when
F1 lands (it changes how navigation works) and link this document from `docs/ROADMAP.md`.
