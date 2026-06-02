# Exploration: Public Character Profiles

> **Status**: EXPLORATION — not a spec, not a design. Conclusions captured during ideation. Will be promoted to SDD `proposal` + `spec` when scope is locked.
> **Date opened**: 2026-05-25
> **Owner**: Mauricio
>
> **2026-06-02 cross-reference — `character-codex` (knowledge/discovery)**: A sibling
> initiative, the *Character Codex* (per-character knowledge: bestiary, magic-item
> identification, NPCs/factions/locations a PJ has discovered — for anti-metagaming),
> is being built FIRST. See engram `sdd/character-codex/*`. **Both features hook into
> the SAME events** (`item_acquired`/grant, encounter participation, hex revealed).
> When this profiles exploration is promoted to SDD, the event-sourcing layer (§2.2)
> MUST be designed as ONE shared hook layer that both `character_events` (this doc's
> stats timeline) and `character_knowledge` (the Codex) consume — do NOT build two
> parallel event pipelines. This doc remains an exploration only; nothing here is built yet.

---

## 1. Vision

Public, customizable, shareable character profiles — inspired by Steam profiles and Discord profile cards. Players curate what they want to show about their character: stats, signature moments, items, missions, badges, cosmetics. Each profile is something the player feels proud of and wants to share.

The feature has two layers that compose into one experience:

- **Player layer** — the meta identity. Lifetime stats across all PJs, collection of unlocked cosmetics, player-level badges, list of characters owned.
- **Character layer** — the in-character identity. Stats, moments and badges that belong to a specific PJ. Dies with the PJ (becomes a memorial when retired/dead).

Cosmetics are unlocked by the **player**, equipped on each **character**. Some achievements are **player-bound** (transferable, part of collection); some are **PJ-bound** (stay with that character, create emotional attachment).

---

## 2. Decisions made

### 2.1 Hybrid model: player + character profiles

Both exist. Both have public-shareable URLs. The player profile shows the player's full collection and lifetime stats; the character profile shows that PJ's specific story with the player's chosen cosmetics equipped.

**Rationale**: pure character-only loses the cross-PJ collection that makes cosmetics meaningful. Pure player-only loses the narrative attachment to individual PJs. Hybrid keeps both.

### 2.2 Event sourcing for stats

Stats are NOT stored as counter fields on the character row. Every hito (crit, fumble, kill, session played, quest completed, level up, item acquired, death, etc.) is recorded as an **atomic event** with full attribution:

```
event {
  character_id
  type: 'crit' | 'fumble' | 'kill' | 'session_played' | 'quest_completed'
      | 'level_up' | 'death' | 'item_acquired' | ...
  source: 'discord-bot' | 'dm-manual' | 'owlbear-plugin' | 'foundry-plugin' | 'web-self'
  session_id? (optional — when event belongs to a tracked session)
  attested_by? (user_id of the DM who confirmed the event, when applicable)
  payload (event-type specific details)
  occurred_at
  created_at
}
```

Profile stats are **derived aggregations** over the event log.

**Why this and not counter fields**:
- **Auditability**: every shown stat has verifiable origin.
- **Extensibility**: adding a Foundry or Owlbear plugin is just "another source writing events of the same schema" — no migrations.
- **Reprocessing**: changes to how an achievement is computed can be replayed without losing data.
- **Narrative timeline**: profile can render "Vincúthar's chronicle" as a chronological feed of events ("Mar 15 — critical hit vs the Beholder, witnessed by DM X"). This is a first-class profile feature, not an afterthought.

### 2.3 Ingestion sources — multi-source from day one

Stats can be written to a character by multiple sources:

1. **DM manual entry** (web UI for the DM to log hitos post-session)
2. **Discord bot** (existing `apps/bot` — bot rolls and events get recorded automatically)
3. **Owlbear Rodeo plugin** (future)
4. **Foundry VTT plugin** (future)
5. **Web self-report** (player logs their own — see §2.4 for trust handling)

The event schema is **source-agnostic by design**. New sources are integrations against the same write API, not new tables.

### 2.4 Strict trust model

Only events with these `source` values count toward the **public profile** stats and badges:

- Any `source` that is a system integration (`discord-bot`, `owlbear-plugin`, `foundry-plugin`) — system-attested.
- `dm-manual` — DM-attested.
- `web-self` ONLY when `attested_by` references a DM user — self-reported then confirmed.

Self-reported events without DM attestation are still STORED (the player may use them for private notes / personal tracking), but do NOT count toward the public profile.

**Rationale**: the public profile is meant to be a thing of pride. Free self-report would degrade the value — anyone could claim 1000 crits. Strict attestation keeps the profile professional and trustworthy. Aerolab + Mauricio's communication discipline supports this; the assumption is that DMs in this product are willing to attest, and players in this product respect that.

**Tradeoff accepted**: casual home games where the DM does not want to bother with attestation will see incomplete public profiles. We accept this. Private/personal tracking still works for them.

### 2.5 Some achievements are PJ-bound, not transferable

Achievements split into two categories:

- **Player-bound** (transferable, part of player collection): "First campaign completed", "10 PJs created", "1000 rolls". These travel with the player across PJs.
- **PJ-bound** (stay pinned to the character): "Survived the Tomb of Annihilation with this PJ", "Reached level 20 with this PJ", "Defeated a CR 20 monster solo". These do NOT transfer if the PJ dies.

When a PJ dies/retires, the PJ-bound badges remain on the (now read-only) memorial profile. This is the mechanic that gives each character a non-transferable story.

---

## 3. Open questions

These need to be resolved before this becomes a `proposal`. Listed in rough priority order.

### 3.1 Campaign / session model — RESOLVED (2026-05-25 audit)

**Status**: Campaign and session foundations EXIST and are solid.

Audit findings (read-only sweep of schema, domain, api, web, bot):

- `campaigns` (`apps/api/src/infra/db/schema.ts:69`) — has `gmUserId`, `rulesProfile` (JSONB), full CRUD via `apps/api/src/http/routes/campaigns.ts`.
- `campaignMembers` (`schema.ts:83`) — composite PK (`campaignId`, `userId`), `role` enum (`player` | `gm`). GM auto-joins on campaign creation.
- `sessions` (`schema.ts:145`) — has `campaignId`, `gmUserId`, `status` enum (`scheduled` | `active` | `paused` | `completed` | `cancelled`), state machine enforced via `applyTransition()`. Already a "live entity" with reward distribution on complete.
- `sessionParticipants` (`schema.ts:198`) — composite PK (`sessionId`, `characterId`), with `joinedAt` / `leftAt` for mid-session drops. **Attendance is per-character, exactly what we need.**
- `sessionEvents` (`schema.ts:237`) — append-only event table with `sessionId`, `actorUserId` (nullable), `eventType` (open text), `payload` (JSONB), `visibility` (`public` | `dm-only`). Canonical event types already defined: `note`, `hex_revealed`, `poi_discovered`, `npc_met`, `travel`, `xp_award`, `gold_grant`, `item_grant`, `hp_change`, `rest_short`, `rest_long`, `level_up`, `condition`, `inventory_change`, `consume`, `spell_slot_used`. Write path: `POST /sessions/:id/events` and `recordSessionEventForCharacter()` (auto-logs character mutations during active sessions).
- `world_events` (`schema.ts:473`) — campaign-wide persistent history, distinct from session_events. Designed for "official history of the world".
- **DM role is explicit** in both `campaigns.gmUserId` and `campaignMembers.role`.

**The gap we thought was huge is much smaller**: we don't need a foundational "campaigns + sessions" SDD. We need to resolve §3.1.1 below and §3.1.2.

### 3.1.1 Character event log — NEW KEY FORK (replaces the old §3.1)

`sessionEvents` exists but is **session-scoped, not character-scoped**. There is no `characterId` column. Querying "all events for Vincúthar across all sessions" today requires scanning every session's events and inspecting `payload`. That doesn't fly for a profile that aggregates per-PJ stats.

Three architectural options. Each has a real tradeoff:

**Option A — Extend `sessionEvents` with a nullable `characterId` FK + index.**
- ✅ One event log, no new table, reuses the existing append-only write path and visibility model.
- ✅ Existing event types like `level_up`, `item_grant`, `xp_award` are already character-relevant — just need `characterId` populated.
- ❌ Conflates "session narrative event" (DM logs "the party met an NPC") with "character chronicle event" (Vincúthar landed a critical hit). Different audiences read these timelines.
- ❌ Some character events should be possible OUTSIDE a session (DM manually adds a hito retroactively; player journal entries). A `sessionId` FK forces every event to belong to a session, which may not match reality.

**Option B — New `character_events` table, separate from `sessionEvents`.**
- ✅ Clean separation of concerns. Profile queries hit one focused table.
- ✅ Can reference `sessionId` and `world_event_id` optionally (cross-link without coupling).
- ✅ Schema can be tailored to profile needs (`source`, `attested_by`, `payload`, `occurred_at`) per §2.2.
- ❌ Duplicates the event-type taxonomy if some events should appear in both timelines (a `level_up` is both a session narrative event AND a character chronicle event).
- ❌ Two tables to keep consistent if we ever want a unified timeline.

**Option C — Hybrid: keep `sessionEvents` as-is for session-scoped narrative events, add `character_events` for everything character-attributed. Cross-link via FK when both apply.**
- ✅ Each table has a clear single purpose.
- ✅ Either source can be the producer; cross-linking is opt-in.
- ❌ Most complex of the three. Worth it if and only if the conceptual split is real and durable.

**Recommendation (to validate)**: Option C — but only after we draft the stats taxonomy (§3.3) and check which events truly belong to both timelines. If overlap is small (≤2 event types), C is right. If overlap is large (≥6 types), A is right. B alone is probably wrong because it ignores existing infrastructure.

→ **UPDATE 2026-05-25**: Taxonomy now drafted in §3.3. Overlap measured at **~2 events vs ~18 net-new** (see §3.3.8). This pushes the decision firmly to **Option C (hybrid)** — new `character_events` table with required `character_id` and nullable `session_id`, alongside the existing `sessionEvents` table. Final lock-in happens in the SDD `explore` phase for the `character-event-log` change.

### 3.1.2 Bot write path — also new prerequisite

The Discord bot (`apps/bot`) is **read-only today**. It calls the API to fetch and display data, but does NOT write back. For the bot to feed the character event log (one of the three pillar sources per §2.3), we need:

- An authenticated write path from bot → API (system source, not user-impersonating)
- A "which character am I rolling as" UX in the bot (today there is no such command — `/character` is a lookup, not a "set my active character")
- A taxonomy of which bot interactions emit which event types (a `/roll` command that hits a crit should emit a `crit` event with attribution)

This is a **separate SDD** (`bot-character-event-writes` or similar). It should land AFTER the character event log schema is decided in §3.1.1, and BEFORE the profiles feature is shippable end-to-end. Profiles can ship with just DM-manual entry working first — the bot can be a Wave 2 source.

### 3.2 Cosmetics unlock economy

How are cosmetics earned? Several models possible (not yet decided):

- **Achievement-based**: cosmetics drop from completing player-level achievements.
- **Milestone-based**: cosmetics unlock on lifetime milestones (X sessions played, Y levels reached, Z campaigns completed).
- **Event-based**: special cosmetics tied to specific events (community events, seasonal, etc.).
- **DM-grantable**: DM can award a cosmetic from the campaign panel (for in-fiction rewards — "the king grants you a golden border for your token").
- **Purchase / monetization**: out of scope until product direction is clear.

Likely a mix of the first four. Needs explicit decision once the product surface is more defined.

### 3.3 Stats taxonomy v1 — draft catalog with PHB references

The catalog is NOT "everything that can happen in a session". It is a curated list of **profile-worthy moments**: things worth recording as discrete events because they will surface in the profile timeline, drive aggregate stats, or trigger achievements.

#### 3.3.1 Entry schema

Each catalog entry should specify:

```
event_type:        <slug>
phb_ref:           <book + page + section title>
definition:        <one-line factual description grounded in PHB text>
payload_schema:    <required fields the event carries>
frequency:         HIGH | MEDIUM | LOW
profile_visibility: feed | aggregate-count | both | hidden-by-default
source_rule:       RAW | house-rule | platform-only
overlap_with_sessionEvents: true | false
```

Three of these matter most for design:

- **`source_rule`** — distinguishes PHB-literal events from house rules or platform-only inventions. CLAUDE.md §1.1 makes PHB the source of truth; house rules are tracked but opt-in per campaign (`rulesProfile.*`).
- **`frequency`** — defines whether the hito is modeled as an individual event or as a session-end aggregate. Not everything deserves a row.
- **`overlap_with_sessionEvents`** — feeds directly into the A/B/C decision in §3.1.1.

#### 3.3.2 Modeling rule: event vs aggregate

| Category | Modeling | Why |
|---|---|---|
| **High value, low frequency** | ✅ Individual event row | Worth a place in the timeline feed |
| **Medium value, medium frequency** | 🤔 Probably aggregate, sometimes event | Case-by-case |
| **High frequency, narrative noise** | ❌ Aggregate computed at session close — NOT per-event row | Millions of rows for nothing |

**The rule of thumb**: if it will appear in the profile feed ("Vincúthar — Mar 15 — critical hit vs the Beholder"), it is an event. If it only lives as a number in a counter ("234 successful attacks"), it is a session-close aggregate carried in the `session_completed` event's payload.

#### 3.3.3 v1 catalog — Combat (PHB Ch. 9 "Combat", p.189–198)

| event_type | PHB ref | Source | Notes |
|---|---|---|---|
| `crit_hit` | p.194 "Critical Hits" | RAW | Nat 20 on attack. Payload: `target`, `weapon`, `damage_total`. |
| `nat_1_on_attack` | p.194 "Rolling 1 or 20" | RAW | "Automatic miss". **Not a fumble in RAW** — see gotcha §3.3.7. |
| `kill` | — | platform-only | No PHB mechanic, but trackable. Payload: `enemy_name`, `enemy_cr`. |
| `knocked_unconscious` | p.197 "Dropping to 0 Hit Points" | RAW | PJ fell to 0 HP. Payload: `cause`. |
| `death_save_success` | p.197 "Death Saving Throws" | RAW | One of three needed to stabilize. |
| `death_save_failure` | p.197 | RAW | Three = dead. |
| `death_save_crit_20` | p.197 | RAW | Nat 20 on death save = regain 1 HP. **Highest narrative value.** |
| `death_save_crit_1` | p.197 | RAW | Nat 1 on death save = counts as TWO failures. |
| `stabilized` | p.197 | RAW | PJ stabilized at 0 HP. |
| `death` | p.197 "Death" | RAW | Payload: `cause`, `resurrected_at?`. |

#### 3.3.4 v1 catalog — Progression

| event_type | PHB ref | Source | Notes |
|---|---|---|---|
| `level_up` | p.15 "Beyond 1st Level" | RAW | **OVERLAPS** with existing `sessionEvents.level_up`. Payload: `from`, `to`. |
| `feat_gained` | p.165 "Feats" | RAW (opt-in) | Only if campaign allows feats. |
| `spell_learned` | p.114 "Learning Spells of 1st Level and Higher" | RAW | For prepared/known casters. Payload: `spell_slug`. |
| `class_feature_gained` | varies | RAW | Optional — narrative milestone (Extra Attack, Sneak Attack die, etc.). |

#### 3.3.5 v1 catalog — Loot / inventory

| event_type | Ref | Source | Notes |
|---|---|---|---|
| `magic_item_acquired` | DMG p.135 "Magic Items" | RAW | **Only magic items**, not mundane (would be noise). Payload: `item_slug`, `rarity`. |
| `attunement_gained` | DMG p.136 "Attunement" | RAW | Max 3 simultaneous. Payload: `item_slug`. |
| `gold_milestone` | — | platform-only | Derived from running total. Thresholds: 1000gp, 10000gp, 100000gp lifetime. |

#### 3.3.6 v1 catalog — Quests, narrative, sessions

| event_type | Ref | Source | Notes |
|---|---|---|---|
| `quest_completed` | — | platform-only | DM-driven. Payload: `quest_name`, `main_quest: bool`. |
| `notable_moment` | — | platform-only | **The most important profile event.** DM flags "this was epic" with title + free-form description. Pure curation. |
| `npc_befriended` | — | platform-only | DM-driven narrative event. |
| `session_attended` | — | derived | DO NOT emit as event. Derive from `sessionParticipants`. |
| `session_completed` | — | platform | **OVERLAPS** with existing `sessionEvents.session_completed`. Carries aggregated counters in payload (`damage_dealt_total`, `attacks_made_total`, `spells_cast_total`, etc.). |

#### 3.3.7 PHB gotchas that shape the design

##### Gotcha A — "Pifias" do not exist in 5e RAW

PHB p.194: *"If the d20 roll for an attack is a 1, the attack misses regardless of any modifiers or the target's AC."* That is all. **There is no official fumble table.** Narrative consequences ("you trip", "you drop your weapon", "you hit an ally") are universal house rule but house rule nonetheless.

**Decision required**:
- Track as `nat_1_on_attack` (factual, RAW) and let the DM interpret? **(recommended)**
- Track as `fumble` (interpretive) and only meaningful in campaigns that opt in?

**Recommendation — factual event + opt-in display label**: the event is always `nat_1_on_attack` (objectively verifiable). If `rulesProfile.fumbleTableEnabled === true`, the profile renders it as "Pifia"; otherwise as "Nat 1". Same data, different label. This is consistent with CLAUDE.md §1.1 (PHB wins) and treats house rules as a display overlay, not a data shape change.

##### Gotcha B — Nat 1 on skill check is NOT a special outcome in RAW

PHB p.174 "Ability Checks" does not specify critical results for ability checks. Crits are RAW only for attacks and death saves. If we track `nat_1_on_skill_check` / `nat_20_on_skill_check`, the catalog must be explicit: these are **factual events with no RAW mechanical consequence**. They are narratively useful (the famous "I rolled a nat 20 on Persuasion!") but should not be labeled "critical" anywhere in the data layer.

**Recommendation**: defer for v1. Add in a later wave if user feedback requests them.

##### Gotcha C — Death save crits ARE RAW and ARE narrative gold

`death_save_crit_20` (regain 1 HP, immediately conscious) and `death_save_crit_1` (counts as two failures) are explicit PHB mechanics (p.197). They are the most narratively charged moments in 5e. These deserve **premium individual events** in the catalog and should be highly visible in the profile (their own section if needed). Not commodity rows.

#### 3.3.8 How the catalog informs the A/B/C decision (§3.1.1)

Overlap audit against existing `sessionEvents` canonical types:

- **Existing in `sessionEvents`** (overlap): `level_up`, `session_completed`, plus the session-narrative types we will NOT re-emit (`xp_award`, `gold_grant`, `item_grant` generic, `hp_change`, `consume`, `spell_slot_used`, `condition`, `inventory_change`, `rest_short`, `rest_long`, `note`, etc.).
- **Net-new for profile**: `crit_hit`, `nat_1_on_attack`, `kill`, `knocked_unconscious`, `death_save_success`, `death_save_failure`, `death_save_crit_20`, `death_save_crit_1`, `stabilized`, `death`, `magic_item_acquired`, `attunement_gained`, `quest_completed`, `notable_moment`, `feat_gained`, `spell_learned`, `class_feature_gained`, `npc_befriended`. **~18 net-new**.

**Ratio: ~18 net-new vs 2 clearly overlapping (`level_up`, `session_completed`)**.

That is **low overlap**, which pushes the §3.1.1 decision toward **Option C (hybrid)** or **Option B (separate table)**, NOT Option A (extend `sessionEvents`).

Additional pressure for B/C: most net-new events have a clear "character chronicle" purpose distinct from "session narrative". They want:
- A required `character_id` FK (not nullable — every entry MUST belong to a PJ).
- A NULLABLE `session_id` FK (`notable_moment` and `quest_completed` can be DM-added retroactively, outside an active session).
- The full attribution shape from §2.2 (`source`, `attested_by`, `occurred_at`, structured `payload`).

These constraints do not fit `sessionEvents` naturally — `sessionEvents.sessionId` is NOT nullable, `actorUserId` is at user-level not character-level, and the existing event types target session narrative ("hex revealed", "POI discovered") rather than character chronicle. Extending it would require relaxing constraints that exist for good reason.

**Tentative conclusion (to lock in §3.1.1 SDD explore)**: **Option C (hybrid)**. New `character_events` table with required `character_id` + nullable `session_id` + cross-link to `world_events` when relevant. `sessionEvents` stays as-is for session-narrative DM logs. The two `level_up` and `session_completed` overlaps are handled either by (a) emitting to both tables when applicable, or (b) cross-referencing — to be decided in the SDD design phase.

#### 3.3.9 Out of v1 taxonomy

Explicitly NOT in v1, may come later:

- Per-attack `damage_dealt` / `damage_taken` events (use session-close aggregate).
- Per-cast `spell_cast` events (use aggregate).
- Skill check nat 1 / nat 20 (gotcha B — defer).
- Faction reputation changes (no platform support yet).
- `npc_killed_named_recurring` (would require platform NPC registry, future).
- Crit on saving throw — not a RAW concept, defer.
- "Heroic kill of CR ≥ X solo" — derived achievement, not an event type. Computed from `kill` payload + context.

### 3.4 Privacy and sharing controls

The "share link" is the headline feature, but needs explicit decisions:

- Is the public URL guessable (slug) or unguessable (short token)?
- Can the player toggle visibility per section of the profile (show crits but hide deaths)?
- Can the player set a profile to "friends only" / "DM only" / "fully public"?
- Does an unpublished/private character still get a URL or is the URL only minted on first publish?
- Are profiles indexable by search engines? (Likely NO by default — D&D content can be personal.)

### 3.5 Showcase customization (the curation surface)

The whole point is that the player chooses what to show. Concretely:

- A profile has **slots** (e.g. "Featured Moments", "Signature Items", "Top Stats", "Recent Sessions", "Quote Wall").
- The player picks which events / items / stats go into each slot.
- Slot count and types are probably fixed by us; the content within is chosen by the player.

Needs concrete IA work (information architecture) to define the slot system before design.

### 3.6 Cosmetics catalog scope (v1)

What cosmetics actually ship in v1? Candidates:

- Profile background (image, gradient, pattern)
- Accent / theme color
- Token border / frame (visible on the in-game token AND on the profile avatar)
- Token effect (subtle glow, animated rim)
- Name plate style (font, decoration)
- Profile banner
- Layout variants

→ v1 should be **small but complete** (one of each kind, plus 2–3 variants), not a sprawling catalog. Catalog can grow.

### 3.7 Player profile vs Mauricio's existing user identity

The `player profile` introduces a new concept above the character. **What does this map to in the current user model?** Is the player profile == `user`, or is it a separate "public persona" entity owned by a user (allowing one user to have multiple personas — e.g. one professional, one for home games)?

Default assumption: 1 user = 1 player profile. Worth verifying we want that.

---

## 4. Out of scope (for v1)

Explicitly deferred — not in the first proposal:

- Monetization / purchase of cosmetics
- Real-time presence ("currently playing with…")
- Friend lists / social graph (follow another player)
- Comments on profiles
- Leaderboards across players
- Public character showcase pages curated by the platform ("character of the week")
- Cross-PJ "campaign showcase" by the DM
- Mobile native app (the web profile must work mobile-first per `CLAUDE.md`, but no native shell)

These may all be future evolutions but are NOT required for the core value.

---

## 5. Architectural shape (early sketch)

Not a design yet. Just the rough mental model.

```
┌──────────────┐   ┌───────────────┐   ┌──────────────────┐
│ Discord bot  │   │ Web (DM panel)│   │ Plugins (future) │
│ (apps/bot)   │   │ (manual entry)│   │ Owlbear, Foundry │
└──────┬───────┘   └───────┬───────┘   └────────┬─────────┘
       │                   │                    │
       └────────── write events ────────────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │  events table       │  ← event-sourced log
                │  (immutable append) │
                └──────────┬──────────┘
                           │
              ┌────────────┼─────────────┐
              ▼                          ▼
      ┌───────────────┐         ┌──────────────────┐
      │ Aggregations  │         │ Achievements     │
      │ (derived)     │         │ engine (derived) │
      └───────┬───────┘         └────────┬─────────┘
              │                          │
              └──────────┬───────────────┘
                         ▼
            ┌────────────────────────────┐
            │ Public Profile (web)       │
            │  - player profile          │
            │  - character profile       │
            │  - cosmetics applied       │
            │  - shareable URL           │
            └────────────────────────────┘
```

The events table is the **spine**. Everything else derives from it.

---

## 6. Next exploration steps (revised after 2026-05-25 audit)

1. ~~Audit current schema for campaign + session~~ — **DONE**. Foundations exist, see §3.1.
2. ~~Map current `apps/bot` capabilities~~ — **DONE**. Bot is read-only today, see §3.1.2.
3. **Lock the character-event log architecture** (§3.1.1). This is the first SDD `explore` candidate for this feature. Output: choose between Option A / B / C with a stats-taxonomy-driven justification. Should also include a brief look at whether existing event types on `sessionEvents` should be reused as-is or remapped.
4. **Define stats taxonomy v1** (§3.3) with PHB references. Required to validate the choice in step 3.
5. **Sketch the curation UX** — mobile 375px first. Slot system per §3.5. What does "I'm editing my profile" look like.
6. **Sketch the public profile UX** — mobile 375px. The shareable page.
7. **Decide cosmetics v1 catalog scope** (§3.6).
8. **Resolve player↔user identity question** (§3.7).

After 3 + 4 → ready to write the first SDD `proposal` (likely scoped to the **character event log foundation**, NOT the full profile feature).
After 5 + 6 + 7 + 8 → ready for design + tasks of the public-profile surfaces.
After all of the above ship, a separate SDD `bot-character-event-writes` (§3.1.2) brings the bot online as a second event source.

### Recommended SDD sequence (high level)

| # | Change | Purpose |
|---|---|---|
| 1 | `character-event-log` | Schema + write path for character-attributed events (extends or sibling to `sessionEvents`). DM-manual + `web-self` sources only. |
| 2 | `character-profile-public` | Public character profile page with stats, badges, cosmetics, shareable URL. Reads from #1. |
| 3 | `player-profile-public` | Public player profile aggregating lifetime stats across PJs. Reads from #1. |
| 4 | `cosmetics-foundation` | Catalog + unlock + equip mechanics. May land before or alongside #2. |
| 5 | `bot-character-event-writes` | Bot becomes a third event source. Wave 2. |
| 6 | Future plugins (Owlbear, Foundry) | Wave 3+. |

---

## 7. Related references

- `apps/bot` — existing Discord integration.
- `CLAUDE.md` §1.2 — data lives in DB (cosmetics catalog will need DB-driven, not hardcoded).
- `CLAUDE.md` §2 — mobile-first. Public profile is a SHAREABLE link — most opens will be on mobile.
- PHB 2014 — source of truth for what counts as a crit/fumble/etc.
