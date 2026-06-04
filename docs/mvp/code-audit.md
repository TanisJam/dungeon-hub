# MVP Code Audit — dungeon-hub

> **SUPERSEDED** — This 2026-05-29 snapshot is preserved for historical reference only.
> For current system state use **`docs/STATUS.md`** (live, last synced 2026-06-04).
> For the authoritative gap analysis use engram **`mvp/gap-audit-2026-06-04`** (#1809).
> Do not make scope or planning decisions from the content below.

> **Status**: Re-auditado **2026-05-29** (supersede el snapshot original del 2026-05-25). Verificado contra el código real en `main` con evidencia `file:line`. El snapshot del 25-may quedó masivamente desactualizado: marcaba ❌/🟡 features que se completaron entre el 25 y el 29 de mayo (worlds-foundation, class-resources, approval-flow, multiclass UI, inventory close-out, bot /mi-hoja, level-up UI, REST-03/04).
>
> **Cómo usar**: cada item lista status + evidencia (file:line) + gap real. El roadmap del MVP está **prácticamente completo** — ver §0 para el resumen ejecutivo.

---

## 0. Resumen ejecutivo (re-audit 2026-05-29)

**8 de 11 items del roadmap están ✅ COMPLETOS.** Lo que queda es acotado:

| Pendiente real | Item | Naturaleza |
|---|---|---|
| Background write-path no inyecta `worldRefData` (un player puede elegir un idioma deshabilitado por el world en el step de background) | #3 (#513) | Bug funcional acotado |
| Seed-on-boot del compendium (`pnpm import:5etools` sigue siendo manual) + tests que validen import limpio de PHB/XGtE/TCoE | #2 | Ops / cobertura |
| Conflict-resolution UI (enforcement server-side ya existe vía `disabledEntities`) | #2 | UI — verificar si es OUT de MVP (§4) |
| Subrace registries (`subraceRequiredSet`/`subraceReplacingAbilitySet`) siguen PHB-hardcoded | #3 (#513) | Diferido a SDD `compendium-subrace-flags` |
| Tool pools (`tool/pools.ts`) + `ProficiencyMod.ref` validation siguen hardcoded | #3 (#513) | Tech debt aceptado |
| `pnpm dev` arranca solo api (web/bot/supabase = terminales manuales) | Ops | Onboarding |
| Playwright sin proyecto `mobile-375` dedicado (los specs @375px existen y corren bajo `chromium-auth`) | #11 | Higiene CI |

**Conclusión**: el MVP es shippable salvo (a) el bug de background-language-validation (#3), y (b) higiene de ops + mobile CI. Ningún blocker estructural queda en pie.

---

## 1. TL;DR — Score por roadmap step (2026-05-29)

| # | Roadmap step | 25-may | **29-may** | 1-line |
|---|---|---|---|---|
| 1 | `worlds-foundation` | ❌ | **✅** | `worlds`+`worldMembers` (schema.ts:75,103), migraciones 0015/0016, domain `world/`, routes `worlds.ts`, multi-DM via `assertWorldGm`. |
| 2 | `manual-system-foundation` | 🟡 | **🟡** | DSL doc ✅ (`docs/manuals/dsl.md`), `rulesProfile` promovido a worlds ✅. Falta seed-on-boot + import tests + conflict-resolution UI. |
| 3 | `domain-reference-data-runtime-source` (#513) | ❌ | **🟡** | Modifier catalog DB-loaded ✅, language pools DB-resolved per-world ✅. Falta: background write-path injection, subrace registries, tool pools. |
| 4 | `rules-audit-rest` (REST-03 + REST-04) | ❌ | **✅** | REST-03 24h server-clock (`characters.ts:3154`), REST-04 hit-dice choice (`level-up/hit-dice.ts:33`). `sdd/rest-closeout`. |
| 5 | `rules-audit-class-features` (R-07) | ❌ | **✅** | `class-resources/registry.ts` con los 10 recursos (Second Wind, Ki, Sorcery, Channel Divinity ×2, Bardic, Lay on Hands, Arcane/Natural Recovery, Indomitable). |
| 6 | `multiclass-class-step` | 🟡 | **✅** | Level-up UI con new-class path (`level-up/_flow.tsx:436`, `NewClassStep`), gated por `multiclassingEnabled`. SDD #884. |
| 7 | `character-approval-flow` | 🟡 | **✅** | `POST /approve` GM-gated (`characters.ts:1002`), edit-lock `CHARACTER_LOCKED`→409 (`assert-writable.ts`), web `approveCharacter`/`rejectCharacter`. SDD #833. |
| 8 | `inventory-foundation` | 🟡 | **✅** | AC-from-armor (`sheet/armor-class.ts`, PHB p.144), coin weight (`inventory/coin-weight.ts`, PHB p.143), `costCp` proyectado de JSONB. SDD #890. |
| 9 | `dm-session-panel` | 🟡 | **✅** | F1–F4: world char list por status, approve/reject, grant panel (XP/gold/item), ver hoja de cualquier player con `callerRole='gm'`. |
| 10 | `bot-character-read` (G1) | ❌ | **✅** | `/mi-hoja` self-serve (`apps/bot/src/commands/mi-hoja.ts`), 3 test files (era 0). |
| 11 | `mobile-qa-sweep` (H1) | ❌ | **🟡** | 3 specs @375px (`*-mobile.auth.spec.ts`). Falta proyecto `mobile-375` dedicado en `playwright.config.ts`. |

**Cross-cutting**:
- ✅ Tests: domain 78 files, api 65, web 120, compendium 5, **bot 3 (era 0)**.
- ✅ Level-up web UI (C1): `app/characters/[id]/level-up/` existe completo (era ❌).
- ❌ Ops: `pnpm dev` arranca solo api (`package.json:11`). `pg_dump` flow sin documentar.

---

## 2. Detalle por roadmap step (2026-05-29)

### 2.1 `worlds-foundation` ✅

- `apps/api/src/infra/db/schema.ts`: `worlds` (L75) con `ownerUserId` + `rulesProfile JSONB`, `worldMembers` (L103, PK `(worldId, userId)`, role enum `gm|player`). `campaigns.gmUserId` RETENIDO (L129, decisión #774 = session-runner identity), `campaigns.worldId` (L132). `characters.worldId` (L170); `campaign_id` y `campaigns.rules_profile` DROPPED.
- Migraciones `drizzle/0015_worlds_foundation.sql` (crea tablas, backfill 1 world/campaign, reapunta characters) + `0016_world_members_backfill.sql` (DML players → worldMembers).
- Domain `packages/domain/src/world/`: `assert-gm.ts` (assertWorldGm puro), `ref-data.ts`, `phb-defaults.ts`.
- API: `http/routes/worlds.ts` (GET /worlds?mine=1, /worlds/:id, /worlds/:id/characters), `use-cases/world/load-ref-data.ts`, `use-cases/auth/assert-world-gm.ts`.
- Web: `app/worlds/[id]/page.tsx` (DM panel). Char routes usan `assertWorldGm`, no `campaign.gmUserId===userId`.

**Gap diferido**: #782 (invite flow debe escribir campaignMembers + worldMembers atómicamente) → diferido a `character-approval-flow` (ya cerrado parcialmente; el dual-write atómico de invite sigue pendiente como flujo de producción).

---

### 2.2 `manual-system-foundation` 🟡

| Sub-item | Status | Evidencia |
|---|---|---|
| DSL schema (`compendium_*` JSONB + `(slug, source)`) | ✅ | `schema.ts` compendium tables |
| **DSL doc** | ✅ | `docs/manuals/dsl.md` (265 líneas) + `docs/manuals/conflict-resolution.md` (109 líneas) |
| Import pipeline | ✅ | `packages/compendium-import/` + `apps/api/scripts/import-5etools.ts` idempotente |
| **Per-world manual selection** | ✅ | `worlds.rulesProfile JSONB NOT NULL` (`schema.ts:84`); `campaigns.rules_profile` DROPPED (`schema.ts:123`). Migración 0015. |
| Conflict resolution | 🟡 | `disabledEntities` enforced server-side (`use-cases/compendium/profile-filter.ts`); key `languages` agregada (`rules-profile/types.ts:24`); `reprintedAs` existe. **Sin UI.** |
| Runtime DI (#513) | 🟡 | Ver §2.3 |
| Seed pack (PHB/XGtE/TCoE) | 🟡 | `pnpm import:5etools` manual. Sin seed-on-boot. Sin tests de import limpio. |

**Gaps reales**: (1) seed-on-boot ausente, (2) sin tests que validen import limpio de las 3 fuentes, (3) sin conflict-resolution UI (enforcement ya existe — verificar si la UI es OUT de MVP per §4).

---

### 2.3 `domain-reference-data-runtime-source` (#513) 🟡

**Lo que shippeó (era ❌)**:
- **Modifier catalog DB-loaded** (Slice 6 / engine-catalog): tabla `modifier_definitions` (`schema.ts:944`), `seed-modifier-definitions.ts`, `loadModifierDefinitions()` (`use-cases/characters/load-modifier-definitions.ts`). GET /sheet usa `modifierCatalog` (`characters.ts:807`); el `itemModifierMap` hardcoded MURIÓ. #513 resuelto para el catálogo.
- **Language pools DB-resolved per-world** (SDD #807): `WorldRefData` (`domain/src/world/ref-data.ts`), `loadWorldRefData()` lee `compendium_languages` filtrado por `rulesProfile`. `validateRaceSelection` acepta `worldRefData?` con fallback a `phbDefaultPools()`. Los archivos hardcoded `language/pools.ts` y `race/subrace-required.ts` fueron BORRADOS.

**Gaps reales que QUEDAN**:
1. **Background write-path NO inyecta `worldRefData`** (`characters.ts:1798` — `validateBackgroundSelection` sin worldRefData). Un player puede elegir un idioma deshabilitado-por-world en el step de background. **Bug funcional acotado.**
2. **Subrace registries** (`subraceRequiredSet`/`subraceReplacingAbilitySet`) siguen PHB-hardcoded en `phbDefaultPools()` → diferido a SDD `compendium-subrace-flags`.
3. **Tool pools** (`tool/pools.ts`: `ARTISANS_TOOLS`, etc.) hardcoded, sin tag #513 (PHB-fijos, sin necesidad de override documentada).
4. **`ProficiencyMod.ref`** (engine authoring DSL): 2 TODO #513 (`engine/authoring/schema.ts:16`, `engine/types.ts:227`) — validación contra catálogo diferida.
5. Comentario stale en `engine/adapter/derive-inventory-modifiers.ts:29` ("today a hardcoded literal" — ya no es cierto post-Slice 6).

---

### 2.4 `rules-audit-rest` (REST-03 + REST-04) ✅

- **REST-03** (cooldown 24h server-clock en long rest, PHB p.186): `characters.ts:3154` con gate de timestamp.
- **REST-04** (recuperación de hit-dice player-driven): `level-up/hit-dice.ts:33` (`chooseHitDiceRecovery`) + `characters.ts:3210-3244` (valida choice, fallback greedy). Cita `sdd/rest-closeout` (engram #825).
- Cobertura: `tests/integration/character-rests.test.ts:353-756`. Web UI: `app/characters/[id]/_rest-actions.tsx`.

---

### 2.5 `rules-audit-class-features` (R-07) ✅

`packages/domain/src/character/class-resources/registry.ts` con los 10 recursos:

| Recurso | Slug | Line |
|---|---|---|
| Fighter Second Wind | `fighter:second-wind` | :21 |
| Monk Ki | `monk:ki-points` | :29 |
| Bard Bardic Inspiration | `bard:bardic-inspiration` | :47 |
| Paladin Lay on Hands | `paladin:lay-on-hands` | :75 |
| Fighter Indomitable | `fighter:indomitable` | :85 |
| Cleric Channel Divinity | `cleric:channel-divinity` | :94 |
| Paladin Channel Divinity | `paladin:channel-divinity` | :103 |
| Wizard Arcane Recovery | `wizard:arcane-recovery` | :112 |
| Sorcerer Sorcery Points | `sorcerer:sorcery-points` | :120 |
| Druid Natural Recovery | `druid:natural-recovery` | :132 |

Warlock Pact slots: modelados vía spellcasting (`spellcasting/slot-tables.ts`), no como class-resource — correcto per PHB p.107.

**Gap acotado**: Druid Natural Recovery trackea el uso pero el slot-recovery mechanic en sí está scoped-out (comentario en registry).

---

### 2.6 `multiclass-class-step` ✅

- `app/characters/[id]/level-up/page.tsx` + `_flow.tsx:436` (`ModeStep` → botón "Agregar nueva clase" cuando `multiclassingEnabled`) → `NewClassStep` (12 clases PHB). `_step-graph.ts`: `Mode = 'same-class' | 'new-class'`.
- Domain `multiclass/`: `validate.ts`, `prereqs.ts`, `proficiencies.ts`, `effective-scores.ts`. SDD verify #884.

**Scoped-out (documentado)**: subclass selection para clases con L1-unlock en el new-class path, y spell-init de nuevos casters multiclass.

---

### 2.7 `character-approval-flow` ✅

1. Enum `pending_approval` en schema.
2. **`POST /characters/:id/approve`** GM-gated (`characters.ts:1002`, `assertWorldGm`, escribe `approvedBy`/`approvedAt`). Cierra REQ-CAF-APPROVE (SDD #833). `POST /reject` en :1044.
3. **Edit-lock** `status==='active'`: `use-cases/characters/assert-writable.ts` (`assertWritableForEdit` → `CHARACTER_LOCKED` → 409), wired en 8 endpoints wizard.
4. Web: `app/characters/[id]/actions.ts:350` (`approveCharacter`), :384 (`rejectCharacter`), UI `_components/approval-actions.tsx` (GM-only).

---

### 2.8 `inventory-foundation` ✅

| Sub-item | Status | Evidencia |
|---|---|---|
| D1 CRUD | ✅ | — |
| D2 AC-from-armor | ✅ | `sheet/armor-class.ts` (PHB p.144: light/medium/heavy/shield). `ac`/`armorStrengthMin` proyectados de JSONB (`load-item-data.ts:65`). `compute.ts:315` delega. |
| D3 Weight + encumbrance | ✅ | — |
| D4 `item_grant` event | ✅ | `sessions.ts`, `session_events` |
| D5 Coin weight | ✅ | `inventory/coin-weight.ts` (PHB p.143, 50 coins/lb), sumado en `compute.ts` totalCarryWeight. |
| D6 `items.cost` | ✅ | `costCp` proyectado de `data.value` (`extractCostCp` en `load-item-data.ts`). Sin columna DB (read-time projection, design SDD #890). |

---

### 2.9 `dm-session-panel` ✅

| F | Status | Evidencia |
|---|---|---|
| F1 Lista chars del world por status | ✅ | `GET /worlds/:id/characters?status=` (`worlds.ts:125`) + web `worlds/[id]/page.tsx` (StatusTabs) |
| F2 Aprobar/rechazar | ✅ | `POST /approve` (:1002), `/reject` (:1044), UI `approval-actions.tsx` (`callerRole==='gm'`) |
| F3 Panel sesión (XP/gold/item) | ✅ | `POST /xp`, `/grant/gold`, `/grant/item` + web `_components/dm-grant-panel.tsx` |
| F4 Ver hoja de cualquier player | ✅ | `CharacterRow` linkea a `/characters/:id`; sheet fetchea `callerRole` del world → DM chrome |

---

### 2.10 `bot-character-read` (G1) ✅

- `apps/bot/src/commands/mi-hoja.ts` — self-serve, ephemeral, busca char activo por `interaction.user.id` sin arg. Fallback graceful para 0 o >1 chars activos.
- 3 test files en bot: `mi-hoja.test.ts`, `unlink.test.ts`, `embeds/character.test.ts` (era 0).

---

### 2.11 `mobile-qa-sweep` (H1) 🟡

- 3 specs @375px en `apps/web/e2e/`: `inventory-mobile.auth.spec.ts`, `dm-panel-mobile.auth.spec.ts`, `approval-transition-mobile.auth.spec.ts`. Cada uno con `test.use({ viewport: { width: 375, height: 667 } })`.
- **Falta**: proyecto `mobile-375` dedicado en `playwright.config.ts` (solo hay `chromium-public`/`chromium-auth` con Desktop Chrome). Los specs corren bajo `chromium-auth` con override de viewport — funcionan, pero invisibles a nivel proyecto en CI.

---

## 3. Cross-cutting (2026-05-29)

### 3.1 Tests

| Package | 25-may | 29-may |
|---|---|---|
| domain | ~30 | 78 files |
| api (tests/) | 38 | 65 files |
| web | ~21 | 120 files |
| compendium-import | 4 | 5 |
| **bot** | **0** | **3** |

E2E specs nuevos: approval transition, inventory mobile, dm-panel mobile (todos @375px). Level-up E2E y DM-grant siguen pendientes de confirmar como specs dedicados.

### 3.2 Operational (§5.G)

| Item | Status | Gap |
|---|---|---|
| `pnpm dev` arranca stack completo | ❌ | `package.json:11` → solo api. Web/bot/supabase manuales. |
| Backup/restore `pg_dump` documentado | ❌ | Sin doc en `docs/`. |

### 3.3 Level-up UI (C1) ✅

`app/characters/[id]/level-up/`: `page.tsx`, `_flow.tsx`, `_step-graph.ts`, `_spells-step.tsx`, `_subclass-step.tsx`, `actions.ts` + tests. (Era ❌ "no existe ruta web".)

---

## 4. Hot-path recomendado (2026-05-29)

Con el roadmap casi cerrado, el trabajo restante por prioridad:

### 4.1 Bug funcional (arreglar ya)
1. **Background write-path no valida idiomas contra el world pool** (#3, `characters.ts:1798`). Inyectar `worldRefData` en `validateBackgroundSelection`. Bajo esfuerzo, cierra un agujero de validación real.

### 4.2 Higiene de cierre del MVP
2. **Ops**: unificar `pnpm dev` (api+web+bot+supabase) + documentar `pg_dump` (`docs/ops/backup.md`).
3. **Mobile CI**: agregar proyecto `mobile-375` a `playwright.config.ts` para visibilidad en CI.
4. **manual-system**: seed-on-boot + tests de import limpio PHB/XGtE/TCoE.

### 4.3 Tech debt diferido (no bloquea MVP)
- Subrace registries → SDD `compendium-subrace-flags`.
- Tool pools + `ProficiencyMod.ref` validation (#513 residual).
- Invite flow dual-write atómico campaignMembers+worldMembers (#782).
- Conflict-resolution UI (si entra en scope — enforcement ya existe).
- Limpiar comentario stale en `derive-inventory-modifiers.ts:29`.

---

## 5. Surprises / discovery (2026-05-29)

1. **El audit del 25-may quedó obsoleto en 4 días.** El proyecto cerró 7+ SDDs entre el 25 y 29 de mayo. Lección: re-auditar contra código real antes de planificar, no confiar en snapshots.
2. **#1 worlds-foundation estaba marcado ❌ pero estaba completo** — disparó esta re-auditoría.
3. **El único bug funcional vivo** es el background-language-validation gap (#3). Todo lo demás es higiene o tech debt diferido y documentado.

---

## Cross-links

- MVP definition: `docs/mvp/definition.md`
- Engram: `mvp/code-audit` (este doc) + `mvp/code-audit-correction/worlds-foundation` (#1160).
- Roadmap order: §6 del definition.
- Snapshot original (2026-05-25): ver git history de este archivo.
