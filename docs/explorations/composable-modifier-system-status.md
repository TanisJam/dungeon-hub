# Composable Modifier System — Status Audit (Track B)

> **Status**: AUDIT — verificación del estado real vs. la visión. Companion de `composable-modifier-system.md` (el doc de visión, source-of-truth).
> **Date**: 2026-05-29
> **Scope**: estado del engine tras Slices 1-7 (resolution-engine → engine-active-effects), mapeado contra §5 (Final Estimated Set) y §6 (Build Cost) de la visión.
> **Method**: 3 auditorías paralelas (engine domain code, historial de slices en engram, runtime/DB) verificadas con `file:line` contra `main`.

---

## 0. TL;DR estratégico

**Lo construido en Slices 1-7 es el esqueleto de MAYOR RIESGO de la visión, y está PROBADO end-to-end.** Las 4 apuestas arquitectónicas más caras de revertir ya están validadas en producción:

1. **Pull-first (c.2)** — resolución camina el grafo en vivo, sin cache. ✅
2. **Provenance universal** — todo resuelve a `{value, breakdown}` con origen cross-entity. ✅
3. **Registry bidireccional** — modificadores viven en un registro global scoped por `(owner, target, trigger)`, NO en el PJ. ✅ (el "single most important architectural finding" del §4.2).
4. **Stacking a nivel TYPE, no instance** — categorías con estrategia, sin flag `stackable`. ✅

**El riesgo está retirado. Lo que queda es mayormente VOLUMEN (autoría de contenido) + INTEGRACIÓN (cablear piezas que ya existen como tipos), no investigación arquitectónica.**

Deviación notable de la visión: el §6 recomendaba **"parallel app under feature flag, NOT a feature branch"**. El equipo eligió lo opuesto — integración **aditiva in-place** (`engineAc`/`engineStats` conviven junto al `armorClass` legacy en `GET /sheet`). Funciona y de-riskeó el import path web→domain (Slice 3), pero hay que decidir conscientemente si se sigue aditivo o se pivota a la migración del §6.

---

## 1. Apuestas arquitectónicas (§3) — TODAS ✅

| Decisión de la visión | Estado | Evidencia |
|---|---|---|
| §3.1 Stacking a nivel type | ✅ | `engine/stacking/categories.ts:23` (STACKING_STRATEGIES por categoría), `stacking/apply.ts:48`. Sin flag per-instance. |
| §3.2 Evaluación con `ctx` explícito | ✅ | `engine/context.ts:33` — EvaluationContext con self/activeConditions/currentAction/attacker/target/weaponInUse/visibility/runtimeDecisions. |
| §3.3 Provenance first-class | ✅ | `engine/provenance.ts:71` — `Resolved<V> = {value, breakdown}`. `Source.origin` habilita provenance cross-entity. `ProvenanceTag` cerrado (no string). |
| §3.5 Pull-first c.2 (cache opt-in) | ✅ | `engine/resolve/stat.ts:6` "REQ-RESOLVE-01: pull-first provenance (c.2)". Cero cache — correcto por diseño (cache solo cuando profiling lo exija). |

**Esto es lo importante**: estas 4 decisiones eran las de mayor riesgo de la visión. Equivocarse en cualquiera obligaba a un rewrite del rewrite. Están las 4 probadas bajo las 4 reglas PHB más difíciles (Bless, Prone, Counterspell, Wild Shape).

---

## 2. Primitivas (§5: ~18) — 5 sólidas, 7 parciales, 6 ausentes

| Primitiva | Estado | Nota |
|---|---|---|
| NumMod | 🟡 | Existe + dice exprs, pero `op` locked a `'add'` (falta multiply/replace/set) y sin self-reference ("1d6 per 2 levels"). `types.ts:135`. |
| CondMod | ✅ | Predicate AST AND/OR/NOT + world queries, evaluado en vivo. `predicate/*`. |
| ProficiencyMod | ✅ | 6 dominios (skill/lang/tool/weapon/armor/save), expertise ×2. `resolve/stat.ts:138`. |
| ReplaceMod/OverrideMod | ✅ | Substitución + retención + policy. Wild Shape probado. `resolve/stat.ts:76`. |
| GMRuling | ✅ | Escape first-class. `types.ts:209`, usado en form-switching. |
| AdvantageMod | 🟡 | grant/impose + cancelación PHB 173 ✅, pero falta `suppress` (Sharpshooter). `roll-mode.ts:61`. |
| Choice/RuntimeSelection | 🟡 | Tipo declarado (`types.ts:157`), SIN evaluador. |
| StatusToggle | 🟡 | DurationSpec + EndCondition existen, pero NO hay entidad activable on/off (Rage). |
| UsageMod/Charges | 🟡 | Solo variante `tiered`, sin evaluador. Faltan count/time/turn/multi-contributor. |
| ConcentrationMod | 🟡 | Tipo + `removeByConcentrationToken` ✅, pero sin cascade automático (el caller debe llamar). |
| EventTrigger/Reaction | 🟡 | ReactionMod declarado + Counterspell cableado a mano. NO hay event bus que auto-dispare ReactionMods registrados. |
| ForcedCheck | 🟡 | Existe como return value de counterspell, NO como primitiva componible general. |
| ActionMod (grant capability) | ❌ | Sin `kind:'action'`. Darkvision/sentidos no expresables. |
| RestrictionMod (deny capability) | ❌ | Sin `kind:'restriction'`. "No podés castear con Rage" no expresable. |
| ResistMod/ImmunityMod | ❌ | Sin `kind:'resist'`. Resistencia de Rage, inmunidad de Half-Elf no expresables. |
| OwnMod (container) | ❌ | Sin `kind:'own'`. |
| DescMod (narrative) | ❌ | Sin `kind:'desc'` (lo más cercano: GMRuling.prompt). |
| ContextOverrideMod | ❌ | Sin mecanismo. "Cover ignored" (Sharpshooter) no expresable. |

**Lectura**: las 5 sólidas + 7 parciales cubren las reglas PHB que se necesitaban para PROBAR la arquitectura. Las 6 ausentes son extensiones mecánicas del discriminated union (`engine/types.ts`) — agregar un `kind` + su branch en `resolveStat`. Bajo riesgo, alto volumen.

---

## 3. Piezas estructurales (§5: 7) — 2 sólidas, 2 parciales, 3 ausentes

| Pieza | Estado | Nota |
|---|---|---|
| Modifier registry (owner/target/trigger, bidireccional) | ✅ | `registry/query.ts` 3 ejes (self/entities/attackers-of) + `modifier_instances` table como substrato persistente. |
| Predicate language (boolean + world queries) | ✅ | `predicate/*` completo, usado en vivo en el filtro del registry. |
| Action pipeline (named phases + interruption) | 🟡 | Tipos + state machine puros existen (`pipeline/state-machine.ts`), PERO ninguna ruta llama `advancePhase`. No integrado a encounters/sessions. |
| Conditions catalog (named bundles) | 🟡 | Solo Prone hardcoded en TS (`conditions/prone.ts`). Tabla `compendium_conditions` existe pero SIN conexión al engine. TODO §1.2 a DB. |
| Timeline (turn semantics + relative anchors) | ❌ | DurationSpec almacena duración pero NADIE la evalúa. Sin turn-tracker. Un Bless de 1min nunca expira solo (solo por DELETE manual). |
| Resolver hooks (meta-rules) | ❌ | Solo `EscapeHatchNotImplemented` en authoring. Sin registry de handlers. |
| Cache layer (c.2 opt-in) | ❌ (correcto) | Deferido por TODO (`load-modifier-definitions.ts:11`). Correcto: pull-first es la verdad, cache solo cuando profiling lo exija. |

---

## 4. Subsistemas dedicados (§5: 2)

| Subsistema | Estado | Nota |
|---|---|---|
| Form/Persona switching | 🟡 | `form-switching/substitute.ts` (`applyFormSwitch`) + Wild Shape probado en domain. NO persistido ni cableado a ruta. |
| Multiclass spell slots (resolver hardcoded) | ❌ | No existe en el engine. (El multiclass del MVP §6 es Track A, separado — UI de pickear 2da clase, no slots compartidos del engine). |

---

## 5. Runtime substrate — qué hace HOY end-to-end

**Flujos PROBADOS en producción** (`GET /sheet` pull-first, por request, sin cache):
- **Bless cross-entity**: `POST /active-effects {effectSlug:'bless', targetIds}` → catalog lookup DB → parseRule → compileRule → persiste N×2 NumMod en `modifier_instances` (owner=caster, target=ally) → en el `/sheet` del ally aparece `engineStats.attackRoll` con `+1d4` y breakdown que cita al caster. Concentración vía DELETE token.
- **Item modifiers (Cloak of Protection)**: item equipado+attuned → `engineAc` con breakdown, desde catálogo DB (#513 resuelto — homebrew sin redeploy, probado con sentinel +2).
- **Proficiency, Wild Shape, Prone, Counterspell, Frightened, Guidance**: probados en domain (algunos no cableados a runtime).

**DB**: `modifier_definitions` (slug/source/kind/ruleDoc, sin world_id aún) + `modifier_instances` (owner/target FKs, concentration_token, def/scope/predicate/duration JSONB). `target_character_id` es NOT NULL → self-axis aún no persistible (Slice 8).

**Generic trio reutilizable** (zero Bless knowledge): `applyModifierInstances`, `loadPersistedModifiers`, `removeByConcentrationToken` + `applyActiveEffect` (catalog-driven cast genérico).

---

## 6. Proyección — dónde estamos en los 12-18 meses del §6

| Workstream (§6) | Estimación visión | Estado | % aprox |
|---|---|---|---|
| Resolution engine (registry+scope+pipeline+predicate+duration+evaluator) | 6-9 meses | Esqueleto + registry + predicate + pull-first ✅. Falta: timeline/duration eval, pipeline wiring, ~6 primitivas, completar 7 parciales. | ~50-60% |
| PHB authoring (clases/subclases/razas/spells/feats/items/conditions) | 2-4 meses | ~7-9 reglas autoradas de miles. El bulto mayor sigue intacto. | <5% |
| Domain migration + UI rewrite (`{value,breakdown}` + ctx-aware) | 2-3 meses | Ability scores ahora en `dual-shadow (native)` ✅ (engine-ability-scores). `engineAbilityScores` aditivo en `/sheet`. UI sigue legacy. | ~12% |
| Authoring tooling (parse/compile/lint/testgen/playground) | 1+ mes | parseRule/compileRule/testgen ✅. Falta lint/playground robusto. | ~40% |

**Interpretación honesta**: estamos ~2-3 meses de esfuerzo dentro de un proyecto de 12-18. PERO el esfuerzo gastado retiró el grueso del RIESGO (las 4 apuestas arquitectónicas + cross-entity persistence + catálogo DB). Lo que resta es:
- **Volumen** (autoría de contenido PHB) — el workstream más grande, mecanizable con LLM, bajo riesgo.
- **Integración** (cablear pipeline/conditions/timeline que ya existen como tipos a rutas reales).
- **Breadth de primitivas** (6 ausentes + 7 a completar) — mecánico.
- **La decisión de migración** (aditivo in-place vs. parallel-app del §6) — sigue abierta y es estratégica.

---

## 7. Open items de la visión (§7) — estado

1. **Storage schema**: RESUELTO de facto — JSONB polimórfico (`modifier_instances.def/scope/predicate/duration`). No se fue a typed-tables.
2. **Object versioning**: SIN resolver (qué pasa si cambia una def upstream tras referenciarla).
3. **Migration strategy**: ✅ RESUELTO (2026-05-29) — **in-place progressive replacement** (NO parallel-app). La recomendación parallel-app del §6 estaba condicionada a proteger usuarios en producción; la app no está en uso, así que esa justificación se cae. Ver `composable-modifier-system-parity-ledger.md` §0.
4. **Shape exacto del ctx**: RESUELTO — `EvaluationContext` (`context.ts:33`).
5. **Authoring UX**: PARCIAL — pipeline existe, falta playground/lint.
6. **Catalog de condiciones v1**: SIN definir scope (solo Prone hardcoded).
7. **Action pipeline phase taxonomy**: RESUELTO en tipos (`pipeline/phases.ts`), sin integrar.

---

## 8. Próximos pasos recomendados (para discutir)

Tres frentes paralelizables (como plantea §8 de la visión):

**A. Engine core — cerrar integración estructural** (retira el riesgo que queda):
- Slice 8 ya planeado: 4 RuleDocs (Guidance/Hex/Pass Without Trace/Haste) + self-axis (`target_character_id` nullable) + world-scope (`world_id` FK) + cache module-level.
- Timeline/duration evaluator (la pieza ❌ más estructural — sin ella las duraciones son decorativas).
- Cablear el action pipeline a una ruta real (encounter/session).
- Conditions catalog desde `compendium_conditions` (§1.2).

**B. Breadth de primitivas** (mecánico, desbloquea más reglas):
- Las 6 ausentes (ResistMod/ImmunityMod primero — desbloquea Rage, razas), completar `suppress` en Advantage, evaluador de Choice/Usage.

**C. Migración** (§7.3): ✅ DECIDIDO — **in-place progressive replacement**. Gobernado por el parity ledger (`composable-modifier-system-parity-ledger.md`): cada dominio de stat avanza `legacy-only → dual-shadow → engine-authoritative → legacy-deleted` con un parity gate (engine === legacy, o diff documentado con cita PHB) antes de cada promoción. Acción inmediata: escribir los parity gates de los 3 dominios ya en dual-shadow (AC, attack-roll, saving-throw).

**Recomendación de orden**: A antes que B (integración estructural retira riesgo; breadth es volumen que se mecaniza después). El cierre de los 3 dominios en dual-shadow (parte del ledger) es el trabajo más barato y valida el ciclo de migración completo por primera vez.

---

## Cross-links

- Visión (source-of-truth): `docs/explorations/composable-modifier-system.md` (engram #1086).
- Slices: archives engram #1096, #1107, #1116, #1127, #1136, #1148, #1158.
- Engine code: `packages/domain/src/engine/`.
- Runtime: `apps/api/src/use-cases/characters/` (trio + apply-active-effect + load-*), `apps/api/src/http/routes/characters.ts`, `scripts/seed-modifier-definitions.ts`.
- Track A (MVP §6, separado): `docs/mvp/code-audit.md`.
