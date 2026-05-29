# Composable Modifier System — Parity Ledger (Track B)

> **Status**: LIVING DOCUMENT — se actualiza cada vez que un dominio de stat cambia de estado. NO es un snapshot.
> **Date opened**: 2026-05-29
> **Purpose**: rastrear, por cada dominio de stat, si el cómputo es legacy o engine-authoritative — para ejecutar la **migración in-place por reemplazo progresivo** sin que el dual-compute legacy↔engine se vuelva permanente.
> **Decisión que lo origina**: ver §0. Companion de `composable-modifier-system-status.md`.

---

## 0. Decisión de migración (asentada 2026-05-29)

**Estrategia elegida: in-place progressive REPLACEMENT.** NO parallel-app, NO aditivo-por-acumulación.

**Por qué** (contra la recomendación literal del §6 de la visión, que pedía "parallel app under feature flag"):
- La recomendación parallel-app del doc estaba **condicionada a proteger usuarios en producción** ("incorrect stat computation destroys user trust irrecoverably"). **La app NO está en uso** → esa justificación se cae.
- Sin usuarios hay **libertad de migración destructiva** (precedente: `worlds-foundation` dropeó `campaign_id`/`rules_profile` sin red). Eso permite REEMPLAZAR legacy en vez de mantener dos paths.
- Parallel-app obligaría a duplicar todo el andamiaje que YA funciona (auth, DB, rutas, shell Next, compendium import, Track A entero) para cero beneficio de usuario.

**El riesgo del enfoque elegido** (y por qué existe este ledger): aditivo-por-acumulación deja dos paths de cómputo conviviendo para siempre (`engineAc` junto a `armorClass`), que divergen → deuda técnica. El dual-compute debe ser un **estado transitorio por dominio**, no permanente. Este ledger es la disciplina que lo garantiza: cada dominio avanza legacy → dual-shadow → engine-authoritative → legacy-deleted, y NO se queda colgado en dual-shadow.

---

## 1. Estados del ciclo de vida (por dominio)

| Estado | Significado | Quién es la fuente de verdad |
|---|---|---|
| `legacy-only` | El engine no produce este valor todavía. | Legacy (`sheet/compute.ts`) |
| `dual-shadow` | El engine lo produce **en paralelo** al legacy (campo aditivo tipo `engineAc`). Se usa para validar paridad. | Legacy (el engine es solo sombra) |
| `engine-authoritative` | El `/sheet` sirve el valor del **engine**. Legacy se retiene solo como comparación/fallback. | Engine |
| `legacy-deleted` | El cómputo legacy fue **borrado**. El engine es la única fuente. | Engine (única) |

Flujo: `legacy-only → dual-shadow → engine-authoritative → legacy-deleted`. Un dominio NO debe quedar en `dual-shadow` indefinidamente — eso es exactamente la deuda que este ledger previene.

---

## 2. Las dos compuertas (gates)

### Gate A — Parity Gate (`dual-shadow → engine-authoritative`)

Para promover un dominio, DEBE existir un test que compare engine vs legacy sobre un **corpus representativo de personajes** (no un solo fixture). El corpus mínimo: 1 char por arquetipo de cómputo relevante al dominio (p.ej. para AC: unarmored bárbaro, unarmored monje, light armor, medium+DEX-cap, heavy, con escudo, con Cloak of Protection).

Condición de promoción — toda diferencia engine vs legacy se clasifica en UNA de estas tres clases. La regla "idéntico O documentado" NO es un checkbox: cada divergencia es una **decisión**, y las divergencias deben ser **raras**.

**Taxonomía de divergencias (clasificar CADA diff):**

- **(a) engine-más-correcto** (bug latente en legacy) → **permitido para promover**, PERO exige: cita PHB + **un ticket/issue trackeado**. Razón: al flippear Gate B esta divergencia se vuelve un **cambio de comportamiento visible** para el usuario — no es "documentar y olvidar", es un fix deliberado que QA/usuarios deben esperar. Se registra en la columna "Notas / diffs PHB".
- **(b) engine-incorrecto** (legacy más correcto, o ambos mal) → **BLOQUEA la promoción**. Se arregla el engine ANTES de promover. NO se permite colar como "diff documentado".
- **(c) equivalente** (mismo valor, distinta representación) → happy path, promueve directo.

**Anti-loophole**: la clase (a) es la única excepción al "idéntico", y NO es libre — sin cita PHB + ticket, una diferencia se trata como (b) y bloquea. Esto evita que bugs del engine se disfracen de "corrección intencional".

**Divergencia no production-reachable**: si el código que produce el diff no está cableado a ninguna ruta (p.ej. Wild Shape hoy — sin endpoint que lo aplique a un char real), el "diff" es una **prueba de composición de domain**, NO una divergencia viva del sheet. Se documenta como tal y no cuenta como divergencia (a) — porque el sheet no puede exhibirla.

Sin (a)-con-ticket o (c) para todo el corpus, el dominio NO se promueve. El test del parity gate queda como regresión permanente hasta el `legacy-deleted`.

### Gate B — Deletion Gate (`engine-authoritative → legacy-deleted`)

Para borrar el cómputo legacy de un dominio, DEBE cumplirse:
1. El `/sheet` ya sirve el valor del engine para ese dominio (estado `engine-authoritative` estable ≥1 slice).
2. `rg` confirma que **ningún otro path** lee el campo legacy (web, bot, otras rutas, tests que no sean el parity gate).
3. El campo aditivo transitorio (`engineAc`, etc.) se colapsa al nombre canónico (`armorClass`) — una sola key en el contrato del sheet.

Recién entonces se borra el cómputo legacy + el parity gate test se reescribe como test del engine (ya no comparativo).

---

## 3. El ledger

> Estado verificado contra `main` al 2026-05-29. `StatKey` del engine: `packages/domain/src/engine/types.ts:45`. Legacy: `packages/domain/src/character/sheet/compute.ts`.

| Dominio | Legacy (file:line) | Engine StatKey | Estado | Parity gate | Notas / diffs PHB |
|---|---|---|---|---|---|
| **AC** | `compute.ts:545` (`armorClass`) | `'ac'` ✅ | `dual-shadow (native)` ✅ | ✅ [`armor-class.test.ts`](../../packages/domain/src/engine/rules/armor-class.test.ts) | `engineAc` nativo en `/sheet` (base 0, `deriveArmorClassModifiers`). 9 arquetipos (PHB p.14/48/78/144/149). legacy-deleted blocked by formula-cliff → tracked fast-follow `engine-ac-authoritative`. |
| **Attack roll** | per-arma (`load-inventory-detail.ts:278` `computeWeaponAttackBonus`) + spell (`compute.ts:430` `spellcasting[].attackBonus`) | `'attack-roll'` (delta-channel) | `legacy-only` ⚠️ **NO es candidato de parity** | n/a | `engineStats.attackRoll` es un **canal de delta** (Bless/active-effects; value SIEMPRE 0; breakdown-only) — NO computa ningún valor legacy. Attack-roll es per-arma + ctx (`weaponInUse`, ability selection, Sharpshooter) → requiere el **action pipeline** (sin cablear). Weapon attacks → `sdd/engine-action-pipeline`. Spell-attack-bonus (estático per-clase) = sub-pieza separable → posible `sdd/engine-spell-attack-parity` (necesita #513). Ver explore #1197. |
| **Saving throws** | `compute.ts:386-394 (DELETED)` | `'saving-throw.*'` ✅ | `legacy-deleted` | ✅ [`saving-throws.test.ts`](../../packages/domain/src/engine/rules/saving-throws.test.ts) | Resilient+class overlap → 2\*pb (class(a) engine-más-correcto, write-blocked by PROFICIENCY_ALREADY_GRANTED, PHB p.168). `engineStats.savingThrow` flat field removed; per-ability array at `engineStats.savingThrows`. |
| **Initiative** | `compute.ts:544 (DELETED)` | `'initiative'` ✅ | `legacy-deleted` | ✅ [`initiative.test.ts`](../../packages/domain/src/engine/rules/initiative.test.ts) | Pure DEX mod (PHB p.177). No proficiency, no adapter needed. 5-archetype gate: DEX 10/16/20/8 + NumMod +2 (forward-compat for Alert/JOAT). Route: `resolveStat('initiative', nativeDexMod)` with tolerate-read guard. |
| **Speed** | `compute.ts:554` (`speed`, +encumbrance +exhaustion) | `'speed'` 🟡 | `legacy-only` | — | StatKey existe. Legacy aplica penalties (encumbrance/exhaustion) — el engine necesita esos como CondMod antes de poder shadowear con fidelidad. |
| **Ability scores/mods** | `compute.ts:effective (INJECTION SOURCE)` | `'str'\|'dex'\|'con'\|'int'\|'wis'\|'cha'` ✅ | `legacy-deleted` ✅ (fallback caveat) | ✅ [`ability-scores.test.ts`](../../packages/domain/src/engine/rules/ability-scores.test.ts) | Gate B (engine-ability-scores-authoritative): engineAbilityScores injected into computeCharacterSheet as ComputeInput.injectedAbilityScores; compute.ts effective[] sourced from engine. computeEffectiveScores RETAINED as tolerate-read fallback for DB rows missing baseStats (CLAUDE.md §11); NOT a parallel compute path for normal rows. Deletion deferred to data-migration slice (requires baseStats-on-every-row audit). Wild Shape PHY stats: engine=beast (PHB p.66-67). Domain composition proof only. engineAbilityScores top-level response field removed (REQ-AS-CONTRACT-02). Gate B: engine-only literals in ability-scores.test.ts (REQ-AS-GATEB-01). |
| **Proficiency bonus** | `compute.ts:537` (`proficiencyBonus`) | n/a (derivado) | `legacy-only` | — | Escalar por nivel; el engine lo INYECTA en ProficiencyMod pero no lo computa como stat. Probablemente se queda como input, no dominio del ledger. |
| **Skills** | `compute.ts:394-414 (DELETED)` | `'skill.*'` ✅ | `legacy-deleted` | ✅ [`skills.test.ts`](../../packages/domain/src/engine/rules/skills.test.ts) | Dedup across sources (class/bg/race): IDENTICAL behavior (Set dedup in adapter mirrors legacy Set — NOT a divergence). 9-archetype gate: PHB p.173-179. Expertise deferred (no snapshot field, PHB p.96/p.123). Space-keyed skills ('animal handling', 'sleight of hand') work via plain-string equality in stat.ts:162. |
| **Passive perception** | `compute.ts:416-417 (DELETED)` | derived from `skill.perception` ✅ | `legacy-deleted` | ✅ [`skills.test.ts`](../../packages/domain/src/engine/rules/skills.test.ts) | passivePerception = 10 + engine perception.modifier (PHB p.177). No divergence cases. Trivial direct derivative of skills gate; closed in same slice (Approach A). |
| **HP (max)** | `compute.ts:546` (`hitPoints`) | ❌ sin StatKey | `legacy-only` | — | Necesita StatKey `'hp-max'`. Form-switching (HP stacking del §4.3) depende de esto. |
| **Spell save DC / attack** | (spellcasting module) | ❌ sin StatKey | `legacy-only` | — | Deriva de ability + pb. Migra junto con ability scores. |

**Resumen al 2026-05-29 (post engine-ability-scores-authoritative)**: 1 en `dual-shadow (native)` (AC ✅) — con parity gate. 5 `legacy-deleted` (**ability-scores/mods** ✅ GATE B, **saving-throws** ✅ PRIMER ciclo completo, **initiative** ✅ SEGUNDO ciclo completo, **skills** ✅ TERCER ciclo completo, **passive-perception** ✅ en mismo slice que skills). **attack-roll**: reclasificado a `legacy-only` — NO es candidato de parity (canal de delta; per-arma/ctx → action-pipeline SDD; ver explore #1197). 1 engine-capable sin cablear (speed). Resto `legacy-only` sin soporte engine. Nota: ability-scores/mods legacy-deleted con caveat — computeEffectiveScores RETENIDO como fallback tolerate-read (filas DB sin baseStats); deleción completa requiere data-migration slice.

---

## 4. Orden de migración recomendado

> **CORRECCIÓN 2026-05-29** (post `sdd/engine-sheet-parity/explore`): el orden original ponía AC/saves/attack primero "porque ya estaban en dual-shadow". El explore reveló que ese dual-shadow es **engañoso**: ninguno computa el valor COMPLETO nativo —
> - **AC** se siembra de la base legacy (`resolveStat('ac', sheet.armorClass.value, ...)` → `legacyAC + mods`),
> - **saving-throw** y **attack-roll** usan base `0` → son **canales de delta** (solo suman Cloak/Bless), no el valor pleno (`abilityMod + pb`).
>
> Los tres dependen de que el engine compute la **base nativa** (ability mods + proficiency + fórmula de armadura), y eso depende de **`ability-scores`**. Por lo tanto ability-scores es el verdadero nodo fundacional y va PRIMERO. Promover AC/saves/attack antes sería "promoción hueca" (teatro: no remueve la dependencia legacy).

Por dependencia (no por costo):

1. **Ability scores/mods** ⭐ FUNDACIÓN — el engine computa ability mods nativos (base racial + ASI + feats + ReplaceMod para Wild Shape). Agregar StatKey `'ability'`. **Desbloquea TODO lo demás**: AC, saves, attack, skills, passive perception, spell DC, HP. Es el nodo central del grafo de derivación. → SDD `engine-ability-scores`.
2. **Proficiency bonus** → escalar por nivel; probablemente input del engine, no dominio del ledger. Confirmar en ability-scores.
3. **AC** → con ability mods nativos, el engine computa la fórmula de armadura sin sembrar del legacy → Gate B real. (El parity gate corpus de AC, 9 arquetipos, se puede escribir junto con este paso; sobrevive la transición a nativo.)
4. **Saving throws** → `resolveStat` por ability con `abilityMod + pb` nativo → reemplaza `savingThrows[*]`.
5. ~~**Attack roll**~~ → **NO es migración de parity** (explore #1197): es per-arma + ctx-dependiente, sin valor legacy escalar único; `engineStats.attackRoll` es solo un canal de delta (Bless). Weapon attacks → `sdd/engine-action-pipeline` (cablear `advancePhase` a rutas de encounter con `weaponInUse` en ctx). Spell-attack-bonus (estático per-clase) → posible `sdd/engine-spell-attack-parity` separado (prerequisito #513, `SPELLCASTING_ABILITY` hardcoded).
6. **Initiative** → cablear `resolveStat('initiative')` (legacy = dexMod, trivial una vez que dexMod es engine-native).
7. **Skills + passive perception** → tras ability.
8. **Speed** → requiere CondMod para encumbrance/exhaustion penalties primero.
9. **HP (max)** → StatKey `'hp-max'`; habilita el HP stacking de form-switching.
10. **Spell save DC / attack** → tras ability scores.

Cada promoción exitosa borra un pedazo de `sheet/compute.ts`. La meta final: `compute.ts` deja de computar stats y solo ensambla el contrato del sheet desde el engine.

---

## 4b. Guardrail de provenance (labels / nombres)

Regla cross-change para los labels del breakdown (`Source.label`):

- **NUNCA hardcodear nombres humanos** de raza/feat/item/spell en el domain (viola §1.2 — los nombres viven en el compendium DB). El label del domain lleva: tipo de fuente + ability/stat + valor + **slug ref donde esté disponible gratis** (p.ej. feat slug). Ejemplo v1: `"Racial ASI +2 STR"`, `"Feat (resilient) +1 CON"` — NO `"Mountain Dwarf +2 STR"`.
- **La resolución slug → nombre humano** ("Mountain Dwarf") ocurre en la **capa de presentación**, desde el compendium, cuando se construya la UI del breakdown. NO en domain.
- **`Source.label` se computa on-read** (no se persiste) → cambiar su contenido más adelante es gratis, sin migración. Por eso NO se agrega un `sourceRef` estructurado especulativamente ahora: el slice que construya la UI del breakdown lo agrega, informado por las necesidades reales del renderer (slug? icono? link?). Estructura prematura = tan errada como string prematuro.
- Hoy el snapshot YA tiene `race.slug`/`subrace.slug` (`sheet/types.ts:92-93`) y los feats tienen slug — la data está disponible cuando la UI la necesite, sin migración ni cambio de `AppliedAsi`.

## 5. Protocolo de actualización

- **Cuándo**: cada slice que toque un dominio actualiza su fila ANTES de cerrar (en el `apply` o `verify`).
- **Qué**: estado nuevo + link al parity gate test (file:line) + diffs PHB documentados si los hay.
- **Quién**: el slice que promueve es dueño de actualizar la fila. El `sdd-verify` chequea que el ledger esté sincronizado con la realidad del código (igual que cazamos el code-audit stale).
- **Regla de oro**: ningún dominio se queda en `dual-shadow` más de lo necesario. Si un slice lo pone en dual-shadow, el slice siguiente (o el mismo) lo promueve o documenta por qué no puede aún.

---

## Cross-links

- Status audit: `composable-modifier-system-status.md`
- Visión: `composable-modifier-system.md` (§6 migration, §7.3 open item)
- Engine StatKey: `packages/domain/src/engine/types.ts:45`
- Legacy compute: `packages/domain/src/character/sheet/compute.ts`
- Engine wiring en sheet: `apps/api/src/http/routes/characters.ts:797-837`
