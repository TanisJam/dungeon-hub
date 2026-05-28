# Exploration: Composable Modifier System

> **Status**: EXPLORATION — not a spec, not a design. Conclusions captured during ideation. Will be promoted to SDD `proposal` + `spec` when scope is locked.
> **Date opened**: 2026-05-28
> **Owner**: Mauricio
> **Engram**: `exploration/composable-modifier-system` (obs #1086)

---

## 1. Vision

Replace the static character sheet model with a **composable object/effect system**. A character — and every artifact that builds a character (race, class, item, feat, level-up, condition) — is represented as a stack of typed objects ("primitives") that compose. Each object either modifies something or adds something.

The final stats are NOT scalars written to the database. They are **dynamic values computed from the modifier graph at evaluation time**. This unlocks:

- **Radical modularity** for homebrew: a DM adds a new feat by composing existing primitives, no code change.
- **Granular rewards**: encounters can drop fine-grained effects, not pre-baked bundles.
- **Full traceability**: every value the player sees can be drilled down to its composing sources.
- **Customization at every layer**: campaign, world, character, item — all the same underlying primitive system.

Mauricio's framing: think of the primitives as **a CPU instruction set**. A small, well-chosen set composes to express arbitrarily complex behavior. Ambiguous rules — those requiring human interpretation — are also covered, because the human (DM) is always available as the final arbiter.

---

## 2. Pattern + Prior Art

The pattern has a name in CS: **declarative DSL with a typed AST**. In the TTRPG software space, it's commonly called an **effect system** or **modifier pipeline**. Mature implementations exist:

- **Foundry VTT — Active Effects** (~6 years of production). Pull-based. Effects have duration, conditions, and predicates. Status conditions are first-class togglable entities.
- **D&D Beyond — Modifiers**. Each modifier carries `componentType`, `friendlyTypeName`, and an `isGranted` predicate mixing automatic + manual toggles.
- **Pathbuilder 2e — Toggles**. Explicit player-controlled toggles; the engine does not infer context.

These tools collectively spent a decade discovering the failure modes. This exploration leverages that prior art rather than rediscovering it.

---

## 3. Settled Architectural Decisions

These were converged on during the exploration. Each is grounded in prior-art lessons.

### 3.1 Stacking lives at the TYPE level, not the instance

Modifiers are tagged with a bonus type (`untyped` / `item` / `status` / `circumstance`, Pathfinder 2e style). Stacking rules are defined at the category level:

- Within a type → keep the highest (or apply the declared strategy).
- Between types → all apply.

A naive `stackable: bool` flag on each modifier is a footgun: two `+1` magic swords both flagged `stackable: true` should still NOT stack because both are item bonuses. The rule belongs to the category, not the instance.

5e does not formalize bonus types, but the implicit rules from the PHB map cleanly to this categorization.

### 3.2 Conditional evaluation via explicit context

Every stat resolution receives an **evaluation context** (`ctx`):

```
resolveStat(character, stat, ctx) → { value, breakdown }
```

`ctx` carries: `activeConditions`, `currentAction`, `target`, `weaponInUse`, `visibility`, runtime per-action decisions, and similar.

Conditional modifiers self-declare a predicate over `ctx`. Status conditions (Raging, Prone, Frightened, etc.) are first-class togglable entities.

**Scope and nesting rules** must be documented per condition family — this is where Foundry's pain accumulated. There is no magic resolution; explicit decisions are required.

### 3.3 Provenance is first-class

Every domain function returns a value WITH its breakdown:

```typescript
getAC(character, ctx): {
  value: 21,
  breakdown: [
    { source: 'base', amount: 10, type: 'untyped' },
    { source: 'Dex modifier', amount: 2, type: 'untyped' },
    { source: 'chain mail', amount: 6, type: 'item' },
    { source: 'shield', amount: 2, type: 'item' },
    { source: 'Defense fighting style', amount: 1, type: 'untyped' },
  ]
}
```

This is NOT an addition to the existing domain API. It is a **substitution** of every computation function. Scope: full domain API rewrite.

### 3.4 Discipline + LLM-assisted authoring + GM Ruling as first-class

Three coupled design commitments:

- **Disciplined minimalism on the primitive set.** Pressure to add a new primitive is a code smell. Default response: exhaust composition + escape hatch first. Without this discipline, the "RISC" becomes CISC in 18 months. Foundry's Active Effects grew from ~5 change modes to 30+ over time — this is the failure mode to avoid.

- **LLM-assisted authoring.** The authoring cost of composing PHB → primitive compositions (12 classes × ~60 subclasses, 30+ races, 300+ spells, 50+ feats, items, conditions) is real — thousands of compositions. Mauricio accepts this cost will be paid by LLMs guided by useful rules + human review.

- **GM Ruling as a first-class primitive**, NOT a fallback. Ambiguous or interpretation-dependent rules are modeled as an explicit primitive with text + optional mechanical effect + provenance. The escape hatch is part of the system, not technical debt.

### 3.5 Evaluation model: pull-first with cache as opt-in optimization (c.2)

Three candidate models were considered:

- **(a) Pull-based pure**: every read walks the modifier graph. Always correct; provenance natural; refactor-safe; "what-if" trivial. Cost: CPU per read.
- **(b) Push-based with cache**: stats materialized; invalidated on change. O(1) reads; queryable. Cost: cache invalidation hell, context-dependent stats don't cache anyway, breakdown forces blob storage, migrations brutal.
- **(c.1) Hybrid cache-first with recompute on miss**: inherits (b)'s invalidation problems.
- **(c.2) Hybrid pull-first with cache as opt-in optimization**: modifier graph is the truth; pull is default; cache introduced ONLY where profiling demands; deleting the cache leaves the system fully correct (just slower).

**Decision: (c.2).** Correctness from pull, provenance natural, refactor-safe, "what-if" free. Cache is a separable optimization layer.

The distinction between (c.1) and (c.2) is critical — they are different architectures wearing the same word "hybrid".

---

## 4. Primitive Set — Empirical Stress Test

The candidate primitive set proposed by Mauricio:

- `NumMod` — numeric modifier (add/subtract)
- `CondMod` — conditional modifier (applies if predicate holds)
- `ActionMod` — grants an action / capability
- `OwnMod` — ownership (adds an object/item that may contain sub-objects)
- `DescMod` — narrative text
- `ResistMod` — damage resistance / vulnerability
- `GMRuling` — first-class escape (added during exploration)

The methodology: pick concrete PHB rules covering distinct dimensions, attempt composition, classify each piece as ✓ (fits) / ✗ (gap revealed). Gaps are then triaged: composition can absorb it, escape hatch absorbs it, OR a new primitive is needed.

### 4.1 Round 1 — Seven baseline rules

#### Half-Elf

| Piece | Verdict |
|---|---|
| +2 Cha | ✓ `NumMod` |
| +1 to two stats of choice | ✗ **missing `Choice` / RuntimeSelection** |
| Darkvision 60 ft | ✗ **`ActionMod` doesn't fit; missing `SenseMod` (or extend ActionMod to "capability")** |
| 2 skills of choice | ✗ **missing `ProficiencyMod`** (proficiency is declarative boolean, not NumMod) |
| Advantage on saves vs charmed | ✗ **missing `AdvantageMod`** (advantage modifies roll mode, not value) |
| Immune to magical sleep | ✗ **missing `EffectImmunityMod`** (or generalize `ResistMod` to effect categories) |
| 1 extra language | ✗ (depends on Choice + ProficiencyMod) |

#### Rage (Barbarian)

| Piece | Verdict |
|---|---|
| Bonus-action activation | ✗ **missing `StatusToggle` as first-class entity** |
| Advantage on Str checks/saves | ✗ requires `AdvantageMod` |
| Bonus damage on melee Str attacks | ✓ via `CondMod` (assuming ctx well-defined) |
| Resistance to b/p/s | ✓ 3× `ResistMod` |
| Cannot cast spells / concentrate | ✗ **missing `RestrictionMod`** (capability denial, opposite of `ActionMod`) |
| 1 minute or until end condition | ✗ **missing `DurationSpec + EndCondition` metadata** (mandatory on ephemeral modifiers, not a standalone primitive) |
| N rages per long rest | ✗ **missing `UsageMod / Charges`** with reset trigger |

#### Bless

| Piece | Verdict |
|---|---|
| Up to 3 targets of choice | ✗ variant of `Choice` (multi-target) |
| +1d4 to attack rolls and saving throws | ✗ refinement: `NumMod.value` must accept dice expressions, not just scalars |
| The modifier LIVES IN ANOTHER ENTITY | ✗✗ **STRUCTURAL CHANGE: modifiers do not live in the PJ; they live in a global registry with target scope** |
| Concentration | ✗ **missing `ConcentrationMod`** (cross-entity dependency) |
| 1 minute duration | ✗ DurationSpec (real clock) |

#### Sharpshooter

| Piece | Verdict |
|---|---|
| No disadvantage at long range | ✗ **advantage system needs 3 ops: `grant`, `impose`, `suppress`** + must respect 5e rule "any adv + any dis → neither applies" |
| Cover ignored | ✗ **missing `ContextOverrideMod`** (modifies ctx computation, not a stat) |
| -5/+10 opt-in per attack | ✗ **ctx must transport runtime per-action decisions** (ephemeral toggle, not persistent state) |

#### Boots of Speed

| Piece | Verdict |
|---|---|
| Double speed | ✗ **`NumMod` needs `op: 'add' \| 'multiply' \| 'replace' \| 'set'`** |
| Toggle | ✗ already identified (StatusToggle) |
| OAs against you have disadvantage | ✗ outgoing-target modifier (external emission to attackers) |
| 10 min per day, subdivisible | ✗ **`UsageMod` needs time-pool variant** (not just count-pool) |

#### Prone

| Piece | Verdict |
|---|---|
| Disadvantage on own attack rolls | ✗ requires `AdvantageMod` |
| Attacks against me: advantage if melee close, disadvantage if ranged | ✗✗ **outgoing-aware modifiers**: the registry needs an actor/target axis so defensive modifiers can affect rolls made AGAINST the defender, with predicates over attacker properties (distance, weapon type, etc.) |

#### Wild Shape

| Piece | Verdict |
|---|---|
| Game stats replaced by beast stats | ✗ **missing `ReplaceMod / OverrideMod`** (substitution, not modification) |
| Except Int/Wis/Cha preserved | ✗ **per-stat retention policy** |
| Skills/saves: max(self, beast) | ✗ another stat resolution policy |
| Equipment merges/drops — DM decides | ✓ `GMRuling` fits naturally |
| Duration + revert at 0 HP | ✗ DurationSpec + EndCondition |
| Operating in another "form" with its own stats/traits/attacks | ✗✗ **Form/Persona switching subsystem** — the most violent rule against the candidate model |

### 4.2 Round 1 synthesis

The candidate set covered ~30% of compositions. The 70% remainder revealed **consistent, finite, repeating gaps** — not chaos. The RISC does not collapse; it adjusts.

**New primitives identified:**

1. `Choice` / RuntimeSelection — critical, first-class
2. `ProficiencyMod` — declarative boolean over a domain (skills, languages, tools, weapons, armor, saves)
3. `AdvantageMod` — three operations (grant / impose / suppress) + 5e cancellation rule
4. `StatusToggle` — first-class togglable state, with duration and end conditions
5. `RestrictionMod` — capability denial (opposite of `ActionMod`)
6. `UsageMod / Charges` — pool with reset trigger; variants: count-pool and time-pool
7. `EffectImmunityMod` — or generalize `ResistMod` to effect categories
8. `ConcentrationMod` — cross-entity dependency
9. `ReplaceMod / OverrideMod` — substitution, not modification
10. `ContextOverrideMod` — modifies ctx computation rather than a PJ stat

**Refinements (not new primitives):**

- `NumMod` needs `op: add | multiply | replace | set`
- `NumMod.value` must accept dice expressions
- `SenseMod` or extend `ActionMod` to "capability" (senses, speech, etc.)

**Mandatory metadata on ephemeral modifiers:**

- `DurationSpec + EndCondition`

**Structural change (NOT a primitive — architectural):**

> **Modifiers do not live in the PJ. They live in a global registry with target scope and explicit actor/target axis.**
>
> Bless emits modifiers that live on allies. Boots of Speed emits a modifier that affects attackers (not the wearer). Prone affects whoever attacks the prone creature based on the attacker's properties. The model is NOT "PJ → bag of mods"; it is "world → registry of mods scoped by (owner, target, trigger)".
>
> This is the single most important architectural finding of the exploration.

**Dedicated subsystem recognized:**

- **Form/Persona switching** (Wild Shape, Polymorph, True Polymorph). The rule is specific enough that forcing it into generic primitives would be over-engineering. Treat as a dedicated subsystem built on top of `ReplaceMod` + `GMRuling` + retention policy.

### 4.3 Round 2 — Five harder rules

#### Counterspell

| Piece | Verdict |
|---|---|
| Reaction triggered by another creature casting | ✗✗ **`EventTrigger` / Reaction system** — MAJOR new primitive. Watches game events with predicate + action on match. |
| Cancels the in-progress spell | ✗✗ **action interception / cancellation cross-entity** — actions must have an interruptible state machine. Structural change to the action pipeline. |
| Auto-counter ≤ slot level | ✗ **`UsageMod` refinement: tier/level pools** (spell slots are N uses per tier) + effect that branches on tier consumed |
| Dynamic DC = 10 + target spell level | ✓ |
| "See a creature" | ✓ visibility refinement on ctx |

#### Sneak Attack

| Piece | Verdict |
|---|---|
| Once per turn | ✓ `UsageMod` refinement: turn-boundary as valid reset trigger |
| Trigger: "you hit with an attack" | ✗ **action pipeline with named phases** (declare → to-hit → on-hit → damage → on-damage-applied). Modifiers hook into specific phases. Structural. |
| Eligibility: `advantage OR (ally adjacent AND ally not incap AND no disadvantage)` | ✓ refinement: `CondMod` predicate language needs boolean composition (AND/OR/NOT) + world queries (allies, distances, conditions) |
| Weapon finesse or ranged | ✓ |
| 1d6 per 2 Rogue levels | ✓ dice expression + self-reference |

#### Stunning Strike

| Piece | Verdict |
|---|---|
| On-hit hook with melee weapon | ✓ already identified |
| Spend 1 ki point per attack (opt-in) | ✓ already identified (Sharpshooter pattern) |
| Target must make Con save (DC = 8 + prof + Wis) | ✗✗ **`ForcedCheck` / Save causality** — MAJOR new primitive. Action forces a check on another entity, with outcome branching. Fundamental for any "target must save" rule. |
| On failure: stunned until end of your next turn | ✗ **Conditions as first-class named entities** (Stunned, Prone, Frightened, Charmed, Grappled, etc.) — bundles of modifiers with a catalog registry. Not new primitives per se, but a catalog requirement. |
| "Until end of your next turn" | ✗ **`DurationSpec` needs relative time anchors** — "until end of X's next turn", "start of round". Requires turn-semantics timeline. |

#### Polymorph

| Piece | Verdict |
|---|---|
| Form switching applied to another entity | ✓ subsystem holds for arbitrary target |
| Willing OR Wis save (unwilling) | ✓ `ForcedCheck` |
| **HP of new form is a SEPARATE pool**; overflow damage carries to base creature | ✗ **form-switching subsystem must support HP stacking**: base HP preserved underneath, form HP on top, overflow carryover. Refinement of the dedicated subsystem. |
| Concentration | ✓ |
| Can't speak / cast / use hands in form | ✓ `RestrictionMod` |
| Revert as action | ✓ |
| 1 hour duration | ✓ |

**Polymorph introduces no new primitives.** It confirms the form-switching subsystem absorbs another variant — the curve is flattening.

#### Multiclass spellcasting / shared spell slots

| Piece | Verdict |
|---|---|
| Spell slots = single shared pool across casting classes | ✗ **`UsageMod` refinement: multi-contributor pools** with per-contributor formulas (full caster lvl×1, half lvl/2, third lvl/3) |
| Each prepared/known spell belongs to ONE class | ✗ **per-feature owner metadata** — data model refinement |
| Spellcasting ability of each spell depends on its owner-class | ✓ derives from owner metadata |
| Slot table from combined caster level with multipliers | ✗✗ **honest meta-rule** — a rule ABOUT how to compose other rules |

**Multiclass spellcasting does not decompose cleanly.** Three honest options:

- **(a) Hardcode as engine-level resolver** (pragmatic; how all serious tools do it).
- **(b) Generalize as `MetaRuleMod` primitive** operating on the modifier set itself (powerful but opens the door to meta-meta-rules).
- **(c) `GMRuling` escape for this specific case.**

**Recommendation: (a).** Alongside Form-switching, this is the second honest concession to "not everything is pure composition". Both are narrow-scoped SRD rules that warrant dedicated subsystems rather than generic primitives.

### 4.4 Round 2 synthesis

**Round 1 surfaced 10 new primitives. Round 2 surfaced 2.** The curve flattened. This is the strongest empirical signal that the primitive set is stabilizing.

**New primitives from Round 2:**

1. **`EventTrigger` / Reaction system** — watchers of game events. Used by Counterspell, Opportunity Attack, Sentinel, Cutting Words, Shield (reaction), and many others. Heavily reused.
2. **`ForcedCheck`** — actions cause checks on other entities with outcome branching. Almost all "save or X" spells and features.

**Structural (not primitives, core architecture):**

3. **Action pipeline with named phases** — every action has phases (declare → resolve → hit/miss → damage → on-hit-effects → on-damage-applied). Modifiers hook into specific phases.
4. **Action interception / cancellation** — in-flight actions are interruptible by reactions. State machine on actions.
5. **Conditions catalog** — Stunned/Prone/Charmed/Frightened/Grappled/etc. as first-class named bundles with their own modifier sets and duration semantics.
6. **Relative time anchors in DurationSpec** — "until end of X's next turn". Requires a timeline with turn semantics.
7. **Predicate language enrichment** — AND/OR/NOT + world queries (allies, distances, active conditions, equipment).

**Refinements of existing primitives:**

8. `UsageMod` with turn-boundary reset, multi-contributor pools, tier/level pools (spell slots).
9. Form-switching with stacked HP pools.
10. Per-feature owner metadata (source-class).

**Honest exception:**

11. **Multiclass spell slots** — engine-level resolver hardcoded. Like Form-switching. These two are the only concessions to "not everything is pure composition".

---

## 5. Final Estimated Set

After Rounds 1 + 2, the system stabilizes at:

### Primitives (~18)

1. `NumMod` — `op: add | multiply | replace | set`, dice expressions, self-reference
2. `CondMod` — rich predicate language (AND/OR/NOT + world queries)
3. `ActionMod` — grants capability
4. `RestrictionMod` — denies capability
5. `OwnMod` — ownership / container
6. `DescMod` — narrative text
7. `ResistMod / ImmunityMod` — by damage type OR by effect category
8. `GMRuling` — first-class escape primitive
9. `Choice / RuntimeSelection`
10. `ProficiencyMod` — domain: skills, languages, tools, weapons, armor, saves
11. `AdvantageMod` — `grant / impose / suppress` + 5e cancellation rule
12. `StatusToggle` — with `DurationSpec + EndCondition`
13. `UsageMod / Charges` — variants: count, time, turn, tiered, multi-contributor
14. `ConcentrationMod` — cross-entity dependency
15. `ReplaceMod / OverrideMod` — substitution, not modification
16. `ContextOverrideMod` — modifies ctx computation
17. `EventTrigger / Reaction`
18. `ForcedCheck` — save causality

### Structural architecture (NOT primitives, core engine)

- **Modifier registry** — global, scoped by `(owner, target, trigger)`, bidirectional actor/target axis
- **Action pipeline** — named phases + interruption support
- **Conditions catalog** — named bundle entities (Stunned, Prone, Frightened, Charmed, Grappled, …)
- **Form-switching subsystem** — dedicated, with HP stacking
- **Predicate language** — boolean composition + world queries
- **Timeline** — turn semantics + relative anchors in `DurationSpec`
- **Resolver hooks** for meta-rules (multiclass spellcasting)

### Dedicated subsystems (honest concessions)

- Form/Persona switching
- Multiclass spell slots

**Total**: ~18 primitives + 7 structural pieces + 2 dedicated subsystems.

This is well within "RISC manageable" territory. For comparison: Foundry's Active Effects has ~30+ change modes plus document-flow infrastructure. This proposal lands at fewer primitives but more formalized structure (which compiles better than ad-hoc change modes).

---

## 6. Reality Check — Build Cost

Honest estimates for going from current state to feature parity on the new model:

| Workstream | Estimate |
|---|---|
| Resolution engine (registry + scope + pipeline + predicate evaluator + duration tracker) with deep tests | 6-9 months |
| Initial PHB authoring (classes, subclasses, races, spells, feats, items, conditions) with LLM assistance + human review | 2-4 months |
| Domain migration + UI rewrite for `{value, breakdown}` return shape and ctx-aware components | 2-3 months |
| Authoring tooling (validation, DSL lint, composition test cases, preview/playground) | 1+ month |

**Total: ~12-18 months of focused work** to reach parity with the current app on the new model. This excludes scope expansion that will emerge during the work.

This is NOT a refactor. It is an **architectural rewrite** and should be planned as such:

- Probably a **parallel app under feature flag**, with per-slice migration.
- NOT a feature branch on the current codebase.
- The engine cannot ship with subtle bugs — incorrect stat computation destroys user trust irrecoverably.

The idea is good enough to be worth this cost, but it must be entered with eyes fully open.

---

## 7. Open Items

These were surfaced during exploration but not resolved. They are first-order questions for the formal proposal:

1. **Storage schema** — JSONB polymorphic union vs typed tables per modifier kind. EAV trap considerations.
2. **Object versioning** — what happens when an upstream race/item definition changes after PJs already reference it?
3. **Migration strategy** — greenfield parallel app vs gradual replacement. Tradeoffs on user disruption.
4. **Exact shape of the evaluation context** — what fields, who populates them, lifecycle.
5. **Authoring UX** — how does an LLM-assisted authoring pipeline actually look? Validation? Test cases per composition? Preview/playground?
6. **Catalog of named conditions** — which conditions are in scope for v1? PHB Appendix A as baseline.
7. **Action pipeline phase taxonomy** — exact set of named phases per action type (attack, spell, ability check, save).

---

## 8. Next Steps

The exploration has converged. Recommended progression:

1. **Decide**: commit to the rewrite, OR shelve and continue iterating on the current model.
2. If committed: open a formal SDD `proposal` for the **resolution engine** as the first vertical slice — defined narrowly enough to be shippable but rich enough to validate the architecture under load.
3. Open separate proposals for:
   - The **authoring DSL + tooling** workstream (parallel track to the engine).
   - The **migration strategy** (parallel app under feature flag vs gradual).
4. Treat **catalog work** (PHB content authoring) as a third parallel track once the DSL stabilizes.

This exploration document is the source-of-truth reference for all subsequent SDD work on this initiative.
