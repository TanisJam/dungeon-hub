# dungeon-hub — Project Conventions for AI Agents and Humans

> **Read this first.** Every change to this repo — code, schema, UI, tests, docs — must respect the conventions below. They are the result of explicit decisions, not defaults. When in doubt, surface the conflict; do not silently diverge.

dungeon-hub is a D&D 5e companion app: character builder + sheet + DM tools. The primary surface is **mobile**, the rules source is **PHB 2014**, and the runtime data is owned by the **database** (not by hardcoded constants).

---

## 1. The Two Sources of Truth

### 1.1 Rules: PHB 2014 wins (always)

Every product decision MUST be validated against the official D&D 5e manuals before being designed, implemented, or accepted. "What the 5etools JSON has" or "what feels right" is **not** a substitute.

**Precedence (in order)**:

1. **PHB 2014** — primary, always wins
2. **DMG 2014** — DM-side rules, treasure, magic items
3. **MM 2014** — monsters, stat blocks
4. **Errata + Sage Advice** — official corrections
5. **XGtE / TCoE / other supplements** — only when a feature explicitly opts in

**How to apply**:

- **SDD proposal**: include a `## Source rule` subsection citing book + page. If a rule is missing or ambiguous, flag it — don't paper over with implementation guesses.
- **SDD spec**: every rule-encoding requirement MUST cite the rule it implements. Example: `REQ-BG-PARSE-01: Custom Background grants 2 skill proficiencies from the full skill list (PHB 125 — Customizing a Background).`
- **Bug triage**: when a user reports something missing or wrong, the **first** step is checking the manual. Don't trust the codebase or the 5etools data to be correct.
- **5etools conflicts**: if the 5etools JSON disagrees with the PHB, **PHB wins**. Patch in the domain layer and log a WARNING at import time (don't error — we want to notice if upstream fixes it). File an upstream issue with PHB citation + JSON path + suggested fix. See policy in [engram #480].
- **House rules**: when the project intentionally diverges from PHB, document it as a house rule with the PHB rule it overrides for context. Don't silently diverge.
- **Mauricio is the final judge** on rule interpretation when official text is ambiguous.

### 1.2 Data: the database is the runtime source of truth

Reference data (languages, tools, items, spells, races, classes, feats, etc.) MUST live in the database. Anything hardcoded in `packages/domain` is **accepted tech debt** with a planned migration to DB + DI.

**Why**: dungeon-hub is built to be fully customizable. A DM must be able to add custom languages, homebrew tools, custom items, etc., without requiring a re-deploy. Hardcoded validation cannot support that. Build-time codegen also cannot — only runtime DI works. See [engram #513].

**How to apply**:

- **Today**: several pools live as hardcoded constants in `packages/domain` (e.g. `subrace-required.ts`, `language/pools.ts`, `tool/pools.ts`). This is a known intermediate state, consistent across batches.
- **Going forward**: when adding new reference data that touches validation, prefer projecting from the DB schema if the schema already supports it. If you must hardcode, leave a `// TODO #513:` comment pointing at the migration ticket.
- **Future SDD `domain-reference-data-runtime-source`** will refactor existing hardcoded pools to accept injected resolvers. New batches should keep their dependency graph clean so this refactor lands per-slice, not big-bang.
- **Never** introduce a new validation rule that hardcodes data the DM should be able to override (skill list, language list, item catalog, etc.). If it's enumerable user-facing content, it belongs in the DB eventually.

---

## 2. Mobile-First UX

dungeon-hub is **mobile-first**. The primary surface is mobile, not desktop. Every UI design, SDD, and review starts from the mobile experience and treats desktop as the secondary surface (still required, but designed after mobile is solid). See [engram #450].

**How to apply**:

- **SDD proposal**: scope discussion MUST start with "what does this look like on a 375px viewport (iPhone SE)" before "what does this look like on desktop". Any UI proposal that doesn't address mobile is incomplete.
- **SDD design**: layout decisions (max widths, popover sizes, sidebars, nav patterns) MUST be specified for mobile FIRST, with desktop as enhancement. Tailwind responsive classes default to mobile: `max-h-64 md:max-h-80` is mobile-first; bare `max-h-80` is desktop-only thinking.
- **Visual review**: every checkpoint MUST be tested in a 375px viewport in addition to desktop. Devtools mobile emulation is mandatory, real device when feasible.
- **Touch semantics**: tap-to-open, tap-outside-to-close, no hover-dependent flows. Pin-to-read, swipe-to-dismiss, bottom-sheet patterns are valid choices.
- **Performance budget**: mobile bandwidth + battery matter. Server-component-first, defer client JS, prefetch sparingly.

---

## 3. Architecture

### Monorepo layout

pnpm workspace (Node ≥22, pnpm 10.7), ESM everywhere (`"type": "module"` in every package).

```
apps/
  web/   — Next.js 15 (App Router) + React 19 + Tailwind 4 (CSS-first) + Supabase SSR. Port 3001.
  api/   — Fastify 5 + Drizzle ORM + Supabase Auth (JWT). Postgres backend. Port 4000.
  bot/   — Discord.js 14. Vitest 2.x unit tests; no E2E (manual smoke against live Discord).

packages/
  domain/              — Pure business logic. Zod schemas. SINGLE source of truth for rules.
  compendium-import/   — 5etools data import utilities.

infra/
  supabase/ — self-hosted via Docker Compose.

data/
  5etools/ — third-party rule data; treat as upstream input, not as truth.
```

### Layering

```
domain (pure)  ←  use-cases  ←  HTTP routes (api) / Server Actions + Server Components (web)
```

**Rules**:

- **Business logic lives only in `packages/domain`.** API and web NEVER reimplement validation. If you're tempted to write a check in a route handler or a `_picker.tsx`, that check belongs in domain instead.
- **API routes are thin**: parse Zod body → delegate to use-case → use-case calls domain → return status code + result. Routes do not contain branching business logic.
- **Use-cases** assemble inputs for domain (loading compendium data, building contexts) and persist outputs. They are the integration point between IO and pure rules.
- **Web** loads via Server Components and mutates via Server Actions (`actions.ts` next to the page). `'use client'` only for interactive bits.
- **Domain functions are pure**: accept all inputs, no IO, no DB, no fetch. They return `{ ok: true, ... } | { ok: false, issues: [...] }`.

### Module resolution

`NodeNext` everywhere. **Required `.js` extensions** in relative imports inside `apps/api` and `packages/domain`. `apps/web` uses Next.js bundler resolution (no `.js` needed).

---

## 4. Tech Stack Quick Reference

| Layer | Tool | Notes |
|---|---|---|
| Runtime | Node ≥22 | `package.json#engines.node` enforces |
| Package mgr | pnpm 10.7 | workspaces, `pnpm --filter` for per-package commands |
| Language | TypeScript 5.7 | strict + `exactOptionalPropertyTypes: true` |
| API | Fastify 5 | `@fastify/jwt`, see §6 for typing pattern |
| ORM | Drizzle 0.38 | `apps/api/src/infra/db/schema.ts` |
| Web | Next.js 15 (App Router) | Server Components default |
| UI | React 19 + Tailwind 4 | CSS-first config: `@import "tailwindcss"`, NO `tailwind.config.js` |
| Auth | Supabase | JWT via Supabase GoTrue, `SUPABASE_JWT_SECRET` in env |
| Validation | Zod | all request/action bodies, no exceptions |
| Tests | Vitest 2.x + @testing-library/react 16 | per-package |
| E2E | Playwright 1.49 | `apps/web/e2e/`, stack must be up |
| Bot | Discord.js 14 | `apps/bot`. Vitest 2.x. No E2E (manual smoke against live Discord). |

---

## 5. Testing

### Strict TDD for domain

Domain code is pure and trivially testable. **TDD is non-negotiable** for `packages/domain`:

1. **RED**: write a failing test FIRST. Run it. See it fail with the expected error.
2. **GREEN**: write the minimum production code to pass. Run it. See it pass.
3. **REFACTOR** (optional): only after GREEN.

Do NOT batch test + impl in one edit. Do NOT write production code without a failing test pointing at it. When citing a rule in a test, **paste the PHB reference in the test comment** so reviewers can sanity-check the expectation against the source-of-truth, not just the impl.

### Test commands

| Package | Command |
|---|---|
| domain | `pnpm --filter @dungeon-hub/domain test` |
| api | `pnpm --filter @dungeon-hub/api test` |
| web | `pnpm --filter @dungeon-hub/web test` |
| compendium-import | `pnpm --filter @dungeon-hub/compendium-import test` |
| E2E (web) | `pnpm --filter @dungeon-hub/web test:e2e` (stack must be running — see `apps/web/e2e/README.md`) |
| All | `pnpm test` |
| Typecheck | `pnpm --filter <pkg> typecheck` or `pnpm typecheck` |
| Build gate | `pnpm typecheck` (NEVER `pnpm build` for verification) |

### Test layers

- **Unit** — Vitest in domain + compendium-import (pure functions)
- **Component** — Vitest + @testing-library/react in `apps/web` (`components/**/*.test.{ts,tsx}`, `lib/**/*.test.{ts,tsx}`, plus colocated `_picker.test.tsx` etc.)
- **Integration** — Vitest in `apps/api` (real Supabase + Postgres, sequential fork pool, 30s timeout)
- **E2E** — Playwright in `apps/web/e2e/` (`*.setup.ts`, `*.public.spec.ts`, `*.auth.spec.ts`)

### Conventions

- `afterEach(cleanup)` is **already global** via `apps/web/vitest.setup.ts`. Do NOT re-add it in test files.
- Round-trip is a first-class test concern. Any "saved state + re-render" feature (wizard step, settings page, etc.) needs an explicit round-trip test — not just send-test + store-test in isolation.
- When adding a required step to the wizard (or any flow with E2E coverage), `rg -r '<step-path>' e2e/` and update affected specs in the SAME PR. Otherwise the spec breaks silently.

---

## 6. API Conventions

- **Zod everywhere**: every request body, every action body. No untyped inputs.
- **Status codes**:
  - `200` success
  - `400 VALIDATION_FAILED` with `issues: [...]` array of domain issues
  - `401 UNAUTHORIZED` (missing/invalid token)
  - `403 FORBIDDEN`
  - `404 NOT_FOUND`
  - `410 EXPIRED` / `CONSUMED` (one-shot resources)
- **JWT user typing**: use `declare module '@fastify/jwt' { interface FastifyJWT { user: SupabaseJwtPayload } }`, NOT `declare module 'fastify' { interface FastifyRequest { user?: ... } }`. The `@fastify/jwt` plugin does its own augmentation that wins over `FastifyRequest.user`. See [engram #525].
- **Issue field naming**: count-mismatch codes use `expectedCount` / `gotCount`; single-value-mismatch codes use `expected` / `got`. See [engram #556].

---

## 7. Web Conventions

- **Server Components by default.** `'use client'` only for interactive bits.
- **Server Actions live in `actions.ts` next to the page** that uses them. Do not put mutations in route handlers when a Server Action fits.
- **Tailwind 4 CSS-first config**: `@import "tailwindcss"` in `globals.css`. NO `tailwind.config.js`. Theme values live in CSS via `@theme`.
- **Use `api` helper from `lib/api.ts`** for fetches with the Bearer JWT; don't roll your own fetch.

---

## 8. Git & Commits

- **Conventional commits**: `feat(scope): ...`, `fix(scope): ...`, `chore: ...`, `test(scope): ...`, `refactor(scope): ...`, `docs(scope): ...`.
- **NEVER** `Co-Authored-By`. **NEVER** `--no-verify`. If a hook fails, fix the underlying issue.
- **Stage explicit paths** (`git add path/to/file`), not `git add .` — avoids accidentally including untracked secrets or build artifacts.
- **Prefer many small thematic commits** over one big mixed commit. Mauricio reviews per-commit; respect that flow.
- **Build verification** is `pnpm typecheck`, not `pnpm build`. Tests are the authority on behavior.

---

## 9. SDD Workflow (Spec-Driven Development)

Non-trivial changes go through SDD. Phases:

```
explore → proposal → spec ┐
                          ├→ tasks → apply → verify → archive
                  design ─┘
```

- **Persistence**: engram is the default artifact store for this project. Each phase saves to engram with a stable topic key (`sdd/<change-name>/<phase>`).
- **Strict TDD** is forwarded into the `apply` phase automatically because `sdd-init` cached `strict_tdd: true` for this project.
- **Apply commits per layer**: domain commit → api commit → web commit. Not one big bundle.
- **Verify** classifies findings as `CRITICAL` / `WARNING` / `SUGGESTION`. `PASS` = zero CRITICAL. WARN can ship if scoped properly.
- **Archive** writes the change to history; do NOT modify code during archive.

### Bootstrap-before-batch pattern

When a 5etools data shape is **new to this codebase** (e.g. `_copy`, `_versions`), do a **bootstrap pass first** that documents the shape, parameterization, and `_mod` operations BEFORE the first batch that depends on it. This prevents the batch from accidentally hardcoding incorrect assumptions. See `bootstrap/5etools-_copy-pattern` (pre `rules-audit-backgrounds`) and `bootstrap/5etools-versions-pattern` (#558, pre `race-dragonborn-ancestry`) for the pattern.

---

## 10. 5etools Data Handling

5etools data lives at `data/5etools/data/`. It is community-maintained, ships **no schema doc**, and **has bugs**.

- **Treat as upstream input, not as truth.** PHB wins (§1.1).
- **`compendium-import`** is the boundary: it reads JSONB and writes normalized rows to the DB. Patch and warn at this layer when known data bugs are detected.
- **`_copy` pattern**: race rows often inherit from another row via `_copy: { name, source, _mod: {...} }`. The importer materializes copies at import time.
- **`_versions` pattern**: two variants — SIMPLE (15+ races, e.g. Aasimar MPMM) and ABSTRACT+IMPL (Dragonborn XPHB, FTD Chromatic/Gem/Metallic). XPHB and FTD are excluded sources in this project; PHB Dragonborn does NOT use `_versions` and instead encodes ancestry as `resist: [{choose:{from:[...]}}]` + narrative table. See [engram #558].
- **Excluded sources** (today): XPHB, FTD. If a feature scope expands to include them, that's a separate decision documented per SDD.

**House rules (intentional divergences from PHB)**:
- `recharge='dawn'` items are treated as **long-rest equivalent** until a campaign-clock SDD lands. Proper RAW (PHB p.141) gates them on in-game time-of-day. See `packages/domain/src/character/inventory/validate.ts:matchesTrigger` comment and engram `sdd/rest-closeout/archive-report`.

**See also**:
- `docs/manuals/dsl.md` — normative description of what each compendium entity looks like after import, plus the patches the importer applies (Dragonborn ancestries, additional spells normalizer, subclass grants, etc.).
- `docs/manuals/conflict-resolution.md` — how `rules_profile.sources` + `disabledEntities` resolve cross-manual overlaps per-world, with worked examples.

---

## 11. Common Pitfalls (Lessons Learned)

If you trip on any of these, save a `discovery` to engram and link from your SDD.

- **5etools shape ≠ PHB rule.** Always verify the implementation against PHB text, not against the JSON. Tests that assert the JSON shape are not sufficient.
- **Required wizard step not in E2E specs.** Adding a new picker without updating `apps/web/e2e/wizard*.spec.ts` silently breaks coverage. Grep before merging.
- **Cross-step skill dedup**: the wizard step that picks a skill (race) doesn't know about later steps' picks (class, background). Same-step gates can run; cross-step gates must run at the final review (or a `validateCharacterFinal` pass).
- **TS bailout on monorepo typecheck**: `tsc` stops emitting downstream errors when upstream packages fail. Always clean leaf packages first (domain, compendium-import), then re-run downstream (api, web).
- **Playwright `selectOption({ label: regex })` does not exist.** Use `selectOption('exact-string')` or `selectOption({ value: '...' })`.
- **Sub-agent skips RED step silently.** When delegating `sdd-apply`, the prompt must say `NEVER write production code without a failing test` AND must ask the agent to paste `Tests N passed` deltas as proof. Without that, agents can ship Phase X with 0 new tests and report "complete".
- **Read-path tolerance for new gates.** When adding a new write-time validation gate (e.g. `RACE_SUBRACE_REQUIRED`), legacy DB rows that predate the gate must still load via GET without erroring. Validate write-only; tolerate read.

---

## 12. Where to find more

- **Skill registry**: `.atl/skill-registry.md` (project-level standards; also cached in engram #386).
- **SDD per-change artifacts**: search engram for `sdd/<change-name>/*`.
- **Project context (this file)**: this `CLAUDE.md`.
- **User-global agent rules**: `~/.claude/CLAUDE.md` (applies to all projects).
- **E2E setup**: `apps/web/e2e/README.md` (pre-requisites, env vars, commands).
- **Manual system**: `docs/manuals/dsl.md` (DSL reference) + `docs/manuals/conflict-resolution.md` (per-world overrides).
- **Roadmaps**: `audit/rules-audit-*/proposal` topics in engram (one per audited domain).
