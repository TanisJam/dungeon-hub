import { and, eq, ilike } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characterKnowledge, compendiumMonsters } from '../../infra/db/schema.js';
import { seesEntry, isMonsterKnownByDefault } from '@dungeon-hub/domain/character/knowledge';
import { listNpcsInWorld, sanitizeNpcForRole, type NpcStatus } from '../world/load-npc.js';
import { listFactionsInWorld, sanitizeFactionForRole, type FactionState } from '../world/load-faction.js';
import { listPoisInWorld, sanitizePoiForRole, stripParentHexStatus, type PoiStatus } from '../map/load-poi.js';

export type EffectiveView = 'dm' | 'player';

/**
 * Supported URL/API kind values for the codex read endpoint.
 * Maps to DB character_knowledge.kind values via KIND_TO_DB_KIND.
 *
 * URL kind  | DB kind    | Notes
 * --------- | ---------- | ---------------------------------------------------
 * monsters  | bestiary   | Full catalog + known flags (ADR-2 Option A, #1946)
 * npcs      | npc        | gated-EMPTY in Slice 1 (UUID bridge deferred #1946)
 * factions  | faction    | gated-EMPTY in Slice 1 (UUID bridge deferred #1946)
 * locations | location   | gated-EMPTY in Slice 1 (UUID bridge deferred #1946)
 * lore      | lore       | gated-EMPTY in Slice 1 (no lore table, deferred)
 *
 * Reference kinds (spells/items/classes/races/backgrounds/feats/conditions) are
 * NOT served by this endpoint — the web routes them to /compendium.
 *
 * codex-knowledge SDD design #1948 §3.2, decisions #1944 FORK 2.
 */
export type CodexKind = 'monsters' | 'npcs' | 'factions' | 'locations' | 'lore';

/**
 * DB-level kind enum for character_knowledge.kind.
 * Always use this when querying the DB — not the URL kind.
 */
type DbKind = 'bestiary' | 'npc' | 'faction' | 'location' | 'lore';

/**
 * Maps URL/API codex kind → DB character_knowledge.kind.
 * This is the ONLY place the translation lives (monsters → bestiary).
 * Do NOT add this mapping elsewhere; route it through here.
 */
const KIND_TO_DB_KIND: Record<CodexKind, DbKind> = {
  monsters: 'bestiary',
  npcs: 'npc',
  factions: 'faction',
  locations: 'location',
  lore: 'lore',
};

// ---------------------------------------------------------------------------
// Row shapes per kind
// ---------------------------------------------------------------------------

export interface CodexMonsterRow {
  slug: string;
  source: string;
  name: string;
  cr: string | null;
  type: string | null;
  size: string | null;
  /** True if this character has a knowledge row for this monster. */
  known: boolean;
}

/**
 * Codex NPC row shape — NO dmNotes field (ADR-1, ADR-6 uuid-bridge-npc).
 * dmNotes is stripped both by sanitizeNpcForRole and by structural exclusion here.
 * Defense-in-depth: even if sanitize is bypassed, the field cannot appear in this type.
 *
 * refKey = npc.id (UUID); refSource = 'world' (LOCKED convention, ADR-2).
 */
export interface CodexNpcRow {
  id: string;         // UUID — the refKey used in character_knowledge
  name: string;
  race: string | null;
  status: NpcStatus;
  description: string | null;
  known: boolean;
  // NO dmNotes field — structurally impossible to leak (ADR-6, REQ-UBN-SECURITY)
}

/**
 * Codex Faction row shape — NO dmNotes field (ADR-1, ADR-6 uuid-bridge-factions-pois).
 * dmNotes is stripped both by sanitizeFactionForRole and by structural exclusion here.
 * Defense-in-depth: even if sanitize is bypassed, the field cannot appear in this type.
 *
 * refKey = faction.id (UUID); refSource = 'world' (LOCKED convention, ADR-2).
 */
export interface CodexFactionRow {
  id: string;             // UUID — the refKey used in character_knowledge
  name: string;
  state: FactionState;    // active|dormant|destroyed|disbanded
  description: string | null;
  known: boolean;
  // NO dmNotes field — structurally impossible to leak (ADR-6, REQ-UBFP-SECURITY)
}

/**
 * Codex Location (POI) row shape — NO dmNotes, NO parentHexStatus, NO hexId field.
 * Triple guard: sanitizePoiForRole strips dmNotes + stripParentHexStatus strips parentHexStatus
 * + this type structurally excludes both fields.
 *
 * refKey = poi.id (UUID); refSource = 'world' (LOCKED convention, ADR-2).
 */
export interface CodexLocationRow {
  id: string;            // UUID — the refKey used in character_knowledge
  name: string;
  status: PoiStatus;     // unknown|discovered|cleared
  description: string | null;
  known: boolean;
  // NO dmNotes field — structurally impossible to leak (ADR-6, REQ-UBFP-SECURITY)
  // NO parentHexStatus — MUST NOT reach the wire (ADR-1b, C10, REQ-UBFP-READ-LOCATION)
  // NO hexId — not needed on the codex read path
}

export type CodexRow = CodexMonsterRow | CodexNpcRow | CodexFactionRow | CodexLocationRow;

export interface ReadCharacterCodexResult {
  rows: CodexRow[];
  total: number;
  knownCount: number;
  effectiveView: EffectiveView;
}

/**
 * Optional list query: case-insensitive name filter + pagination.
 * worldId is required for UUID-based kinds (npcs, factions, etc.) — derived
 * from the character in the route handler and passed here (D4, uuid-bridge-npc).
 */
export interface CodexQueryOpts {
  q?: string;
  limit?: number;
  offset?: number;
  /** Required for npc/faction/location/lore kinds (UUID-based resolvers, ADR-1 uuid-bridge-npc). */
  worldId?: string;
}

// ---------------------------------------------------------------------------
// Per-kind query helpers
// ---------------------------------------------------------------------------

async function readMonstersKind(
  characterId: string,
  effectiveView: EffectiveView,
  opts: CodexQueryOpts = {},
): Promise<{ rows: CodexMonsterRow[]; total: number; knownCount: number }> {
  const q = opts.q?.trim();
  // Load compendium monsters, optionally filtered by name (case-insensitive).
  const allMonsters = await db
    .select({
      slug: compendiumMonsters.slug,
      source: compendiumMonsters.source,
      name: compendiumMonsters.name,
      cr: compendiumMonsters.cr,
      type: compendiumMonsters.type,
      size: compendiumMonsters.size,
    })
    .from(compendiumMonsters)
    .where(q ? ilike(compendiumMonsters.name, `%${q}%`) : undefined)
    .orderBy(compendiumMonsters.name);

  // Load character's known bestiary entries (DB kind = 'bestiary')
  const knownRows = await db
    .select({
      refKey: characterKnowledge.refKey,
      refSource: characterKnowledge.refSource,
    })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        // DB enum stays 'bestiary' — URL kind 'monsters' maps here (KIND_TO_DB_KIND)
        eq(characterKnowledge.kind, 'bestiary'),
      ),
    );

  // Build a fast lookup set: "slug|source"
  const knownSet = new Set(knownRows.map((r) => `${r.refKey}|${r.refSource}`));

  const defaulted = isMonsterKnownByDefault();
  let knownCount = 0;

  const rows: CodexMonsterRow[] = [];

  for (const m of allMonsters) {
    const knows = knownSet.has(`${m.slug}|${m.source}`);
    if (knows) knownCount++;

    // Apply layered visibility gate (no DM-secret flag in Slice 1)
    const visible = seesEntry(effectiveView, false, knows, defaulted);

    if (effectiveView === 'dm') {
      // DM sees all with known flag
      rows.push({ ...m, known: knows });
    } else {
      // Player only sees visible (known) entries
      if (visible) {
        rows.push({ ...m, known: true });
      }
    }
  }

  // total = the gated universe the caller can page through (DM: q-filtered catalog;
  // player: known q-filtered entries). CodexList uses it ONLY for load-more
  // (hasMore = offset < total), so it MUST match the gated set — using the raw
  // catalog count here would make a player's "Cargar más" fetch nothing forever.
  const total = rows.length;

  // Paginate the gated rows only when the caller explicitly requests it (limit/offset).
  // Callers that omit both get the full gated set unchanged (backward compatible).
  // Slicing is applied AFTER gating so a player's page reflects only their visible set.
  const offset = opts.offset ?? 0;
  const paged =
    opts.limit === undefined && offset === 0
      ? rows
      : rows.slice(offset, opts.limit === undefined ? undefined : offset + opts.limit);

  return { rows: paged, total, knownCount };
}

// ---------------------------------------------------------------------------
// NPC resolver — uuid-bridge-npc Wave 5a (ADR-1, ADR-2, ADR-6)
//
// Mirrors readMonstersKind: loads all world NPCs, intersects with
// character_knowledge(kind='npc'), gates by effectiveView, ALWAYS runs
// sanitizeNpcForRole (player='player', DM='gm') on every row.
//
// Security: dmNotes stripped by sanitize AND by CodexNpcRow type (double guard).
// refSource='world' is LOCKED for UUID kinds (ADR-2). Match key = npc.id (UUID).
// Orphaned UUIDs (deleted NPC) silently dropped — knownSet references missing ids.
// ---------------------------------------------------------------------------

async function readNpcsKind(
  characterId: string,
  worldId: string,
  effectiveView: EffectiveView,
  opts: CodexQueryOpts = {},
): Promise<{ rows: CodexNpcRow[]; total: number; knownCount: number }> {
  // 1. Load all world NPCs (small list — client-side filter is fine, ADR-3 D2)
  const allNpcs = await listNpcsInWorld(worldId);

  // 2. Load the character's known NPC set (DB kind='npc')
  const knownRows = await db
    .select({ refKey: characterKnowledge.refKey })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        // DB enum 'npc' — matches KIND_TO_DB_KIND['npcs']
        eq(characterKnowledge.kind, 'npc'),
      ),
    );

  // 3. Build a fast UUID lookup set (refSource is constant 'world' for UUID kinds)
  const knownSet = new Set(knownRows.map((r) => r.refKey));

  // 4. Optional name filter (client-side; world NPC lists are small)
  const q = opts.q?.trim().toLowerCase();

  // 5. Map WorldAccess for sanitize
  const access = effectiveView === 'dm' ? ('gm' as const) : ('player' as const);

  let knownCount = 0;
  const rows: CodexNpcRow[] = [];

  for (const npc of allNpcs) {
    // Apply optional name filter
    if (q && !npc.name.toLowerCase().includes(q)) continue;

    const knows = knownSet.has(npc.id);
    if (knows) knownCount++;

    // DM: all rows + known flag; player: known-only
    if (effectiveView !== 'dm' && !knows) continue;

    // SECURITY: sanitize on every row (ADR-6). dmNotes dropped for player access.
    const sanitized = sanitizeNpcForRole(npc, access);

    rows.push({
      id: sanitized.id,
      name: sanitized.name,
      race: sanitized.race,
      status: sanitized.status,
      description: sanitized.description,
      known: knows,
      // NO dmNotes — CodexNpcRow type enforces structural absence
    });
  }

  // total = ALL world NPCs (unfiltered by effectiveView, filtered by optional name query).
  // For the player, this shows the full world size so they know how many NPCs exist.
  // knownCount = number of known NPCs (for display, e.g. "1/2 known").
  // This differs from the monster pattern (where total=gated) because NPC spec requires
  // total=world count, knownCount=known count (REQ-UBN-READ: total=2, knownCount=1 for player).
  const totalNpcsInUniverse = allNpcs.filter((npc) => !q || npc.name.toLowerCase().includes(q)).length;

  // Paginate gated rows (the rows the caller can see)
  const offset = opts.offset ?? 0;
  const paged =
    opts.limit === undefined && offset === 0
      ? rows
      : rows.slice(offset, opts.limit === undefined ? undefined : offset + opts.limit);

  return { rows: paged, total: totalNpcsInUniverse, knownCount };
}

// ---------------------------------------------------------------------------
// Faction resolver — uuid-bridge-factions-pois Wave 5b (ADR-1 delta, ADR-6 delta)
//
// Mirrors readNpcsKind: loads all world factions, intersects with
// character_knowledge(kind='faction'), gates by effectiveView, ALWAYS runs
// sanitizeFactionForRole (player='player', DM='gm') on every row.
//
// Security: dmNotes stripped by sanitize AND by CodexFactionRow type (double guard).
// refSource='world' is LOCKED for UUID kinds (ADR-2). Match key = faction.id (UUID).
// Orphaned UUIDs (deleted faction) silently dropped — knownSet references missing ids.
// Access type: WorldAccess ('player'|'gm') — NOT MapAccess (C12).
// ---------------------------------------------------------------------------

async function readFactionsKind(
  characterId: string,
  worldId: string,
  effectiveView: EffectiveView,
  opts: CodexQueryOpts = {},
): Promise<{ rows: CodexFactionRow[]; total: number; knownCount: number }> {
  // 1. Load all world factions (small list — client-side filter, ADR-3 D2)
  const allFactions = await listFactionsInWorld(worldId);

  // 2. Load the character's known faction set (DB kind='faction')
  const knownRows = await db
    .select({ refKey: characterKnowledge.refKey })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        // DB enum 'faction' — matches KIND_TO_DB_KIND['factions']
        eq(characterKnowledge.kind, 'faction'),
      ),
    );

  // 3. Build a fast UUID lookup set (refSource is constant 'world' for UUID kinds)
  const knownSet = new Set(knownRows.map((r) => r.refKey));

  // 4. Optional name filter (client-side; world faction lists are small)
  const q = opts.q?.trim().toLowerCase();

  // 5. Map WorldAccess for sanitize (C12: sanitizeFactionForRole takes WorldAccess)
  const access = effectiveView === 'dm' ? ('gm' as const) : ('player' as const);

  let knownCount = 0;
  const rows: CodexFactionRow[] = [];

  for (const faction of allFactions) {
    // Apply optional name filter
    if (q && !faction.name.toLowerCase().includes(q)) continue;

    const knows = knownSet.has(faction.id);
    if (knows) knownCount++;

    // DM: all rows + known flag; player: known-only
    if (effectiveView !== 'dm' && !knows) continue;

    // SECURITY: sanitize on every row (ADR-6). dmNotes dropped for player access.
    const sanitized = sanitizeFactionForRole(faction, access);

    rows.push({
      id: sanitized.id,
      name: sanitized.name,
      state: sanitized.state,
      description: sanitized.description,
      known: knows,
      // NO dmNotes — CodexFactionRow type enforces structural absence (ADR-6)
    });
  }

  // total = ALL world factions (unfiltered by effectiveView, filtered by optional name query).
  const totalFactionsInUniverse = allFactions.filter(
    (f) => !q || f.name.toLowerCase().includes(q),
  ).length;

  // Paginate gated rows
  const offset = opts.offset ?? 0;
  const paged =
    opts.limit === undefined && offset === 0
      ? rows
      : rows.slice(offset, opts.limit === undefined ? undefined : offset + opts.limit);

  return { rows: paged, total: totalFactionsInUniverse, knownCount };
}

// ---------------------------------------------------------------------------
// Location (POI) resolver — uuid-bridge-factions-pois Wave 5b (ADR-1b delta, ADR-6 delta)
//
// Mirrors readNpcsKind but for POIs. CRITICAL: does NOT call filterWorldPoisForPlayer.
// The known-UUID set is the sole visibility gate (ADR-1b). A granted POI on an
// unexplored hex MUST appear (DM grant overrides hex cascade).
//
// parentHexStatus: stripped before shaping each row (never on the wire — C10, ADR-1b).
// Security: dmNotes stripped by sanitizePoiForRole AND by CodexLocationRow type (double guard).
// Access type: MapAccess ('player'|'gm') — NOT WorldAccess (C12: different type alias).
// ---------------------------------------------------------------------------

async function readLocationsKind(
  characterId: string,
  worldId: string,
  effectiveView: EffectiveView,
  opts: CodexQueryOpts = {},
): Promise<{ rows: CodexLocationRow[]; total: number; knownCount: number }> {
  // 1. Load all world POIs via listPoisInWorld({ worldId }) — object arg, NOT bare string (C9)
  const allPois = await listPoisInWorld({ worldId });

  // 2. Load the character's known location set (DB kind='location')
  const knownRows = await db
    .select({ refKey: characterKnowledge.refKey })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        // DB enum 'location' — matches KIND_TO_DB_KIND['locations']
        eq(characterKnowledge.kind, 'location'),
      ),
    );

  // 3. Build a fast UUID lookup set
  const knownSet = new Set(knownRows.map((r) => r.refKey));

  // 4. Optional name filter
  const q = opts.q?.trim().toLowerCase();

  // 5. Map MapAccess for sanitize (C12: sanitizePoiForRole takes MapAccess = 'gm'|'player'|'none')
  const access = effectiveView === 'dm' ? ('gm' as const) : ('player' as const);

  let knownCount = 0;
  const rows: CodexLocationRow[] = [];

  for (const poi of allPois) {
    // Apply optional name filter
    if (q && !poi.name.toLowerCase().includes(q)) continue;

    const knows = knownSet.has(poi.id);
    if (knows) knownCount++;

    // DM: all rows + known flag; player: known-only (known-set is the sole gate — ADR-1b)
    // DO NOT call filterWorldPoisForPlayer — that hides granted POIs on unexplored hexes
    if (effectiveView !== 'dm' && !knows) continue;

    // Strip parentHexStatus BEFORE shaping the row (MUST NOT reach the wire — C10)
    const stripped = stripParentHexStatus(poi);

    // SECURITY: sanitize on every row (ADR-6). dmNotes dropped for player access.
    const sanitized = sanitizePoiForRole(stripped, access);

    rows.push({
      id: sanitized.id,
      name: sanitized.name,
      status: sanitized.status,
      description: sanitized.description,
      known: knows,
      // NO dmNotes — CodexLocationRow type enforces structural absence (ADR-6)
      // NO parentHexStatus — already stripped above (C10, ADR-1b)
    });
  }

  // total = ALL world POIs (unfiltered by effectiveView, filtered by optional name query)
  const totalPoisInUniverse = allPois.filter(
    (p) => !q || p.name.toLowerCase().includes(q),
  ).length;

  // Paginate gated rows
  const offset = opts.offset ?? 0;
  const paged =
    opts.limit === undefined && offset === 0
      ? rows
      : rows.slice(offset, opts.limit === undefined ? undefined : offset + opts.limit);

  return { rows: paged, total: totalPoisInUniverse, knownCount };
}

// ---------------------------------------------------------------------------
// Gated-empty stub helpers (ADR-2 Option A, codex-knowledge #1946)
//
// lore: has no backing table, remains deferred.
// npcs: RESOLVED in uuid-bridge-npc Wave 5a (readNpcsKind above).
// factions/locations: RESOLVED in uuid-bridge-factions-pois Wave 5b (above).
// Slice 1 closes the metagaming leak for ALL 5 categories by routing them to
// the gated endpoint — monsters/npcs/factions/locations fully wired, lore returns empty.
// ---------------------------------------------------------------------------

function readGatedEmptyKind(): { rows: never[]; total: number; knownCount: number } {
  // ADR-2 Option A: return empty gated result.
  // Metagaming leak is closed (no data leaks through), resolver deferred.
  // TODO: wire UUID-based resolver for lore when a lore-entity SDD lands.
  return { rows: [], total: 0, knownCount: 0 };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads the character's scoped codex for the given kind.
 *
 * URL kind → DB kind mapping (KIND_TO_DB_KIND above).
 *
 * monsters:   full catalog + known flags (ADR-2 Option A, real round-trip).
 * npcs:        UUID-based resolver — readNpcsKind (uuid-bridge-npc Wave 5a).
 * factions:    UUID-based resolver — readFactionsKind (uuid-bridge-factions-pois Wave 5b).
 * locations:   UUID-based resolver — readLocationsKind (uuid-bridge-factions-pois Wave 5b).
 *              CRITICAL: does NOT call filterWorldPoisForPlayer — known-set is sole gate (ADR-1b).
 * lore:        gated-EMPTY (no lore table yet, deferred).
 *
 * For DM/devMode effectiveView='dm': all entries + known flag.
 * For player effectiveView='player': ONLY known entries (seesEntry gate).
 *
 * opts.worldId is required for uuid-based kinds (D4: caller derives it from loadCharacter).
 *
 * REQ-CCB-API-01, REQ-CK-GATE-03, GATE-04, codex-knowledge SDD design #1948.
 * REQ-UBN-READ, uuid-bridge-npc SDD design #2003.
 */
export async function readCharacterCodexCategory(
  characterId: string,
  kind: CodexKind,
  effectiveView: EffectiveView,
  opts: CodexQueryOpts = {},
): Promise<ReadCharacterCodexResult> {
  // Static check — kind must be a valid CodexKind (compile-time guard)
  void KIND_TO_DB_KIND[kind];

  switch (kind) {
    case 'monsters': {
      const { rows, total, knownCount } = await readMonstersKind(characterId, effectiveView, opts);
      return { rows, total, knownCount, effectiveView };
    }
    case 'npcs': {
      // uuid-bridge-npc Wave 5a: real NPC resolver replacing gated-empty.
      // opts.worldId is derived from character.worldId by the route handler (D4).
      const worldId = opts.worldId ?? '';
      const { rows, total, knownCount } = await readNpcsKind(characterId, worldId, effectiveView, opts);
      return { rows, total, knownCount, effectiveView };
    }
    case 'factions': {
      // uuid-bridge-factions-pois Wave 5b: real faction resolver replacing gated-empty.
      // opts.worldId is derived from character.worldId by the route handler (D4).
      const worldId = opts.worldId ?? '';
      const { rows, total, knownCount } = await readFactionsKind(characterId, worldId, effectiveView, opts);
      return { rows, total, knownCount, effectiveView };
    }
    case 'locations': {
      // uuid-bridge-factions-pois Wave 5b: real location resolver replacing gated-empty.
      // CRITICAL: uses known-UUID-set gate only — does NOT call filterWorldPoisForPlayer (ADR-1b).
      const worldId = opts.worldId ?? '';
      const { rows, total, knownCount } = await readLocationsKind(characterId, worldId, effectiveView, opts);
      return { rows, total, knownCount, effectiveView };
    }
    case 'lore': {
      // ADR-2 Option A: gated-empty. No lore backing table yet (lore-entity SDD pending).
      const { rows, total, knownCount } = readGatedEmptyKind();
      return { rows, total, knownCount, effectiveView };
    }
  }
}
