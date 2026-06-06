import { and, eq, ilike } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characterKnowledge, compendiumMonsters } from '../../infra/db/schema.js';
import { seesEntry, isMonsterKnownByDefault } from '@dungeon-hub/domain/character/knowledge';

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

export type CodexRow = CodexMonsterRow;

export interface ReadCharacterCodexResult {
  rows: CodexRow[];
  total: number;
  knownCount: number;
  effectiveView: EffectiveView;
}

/** Optional list query: case-insensitive name filter + pagination. */
export interface CodexQueryOpts {
  q?: string;
  limit?: number;
  offset?: number;
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
  const total = allMonsters.length;
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
// Gated-empty stub helpers (ADR-2 Option A, codex-knowledge #1946)
//
// npcs/factions/locations/lore: these world-knowledge kinds have UUID-keyed
// entities (npcs schema.ts:538, factions:504). The read-side bridge that maps
// character_knowledge.refKey=UUID → world entity table is deferred.
// Slice 1 closes the metagaming leak for ALL 5 categories by routing them to
// the gated endpoint — monsters fully wired, the other four return empty.
//
// // TODO: wire UUID-based resolver in follow-up slice (codex-knowledge #1946).
// ---------------------------------------------------------------------------

function readGatedEmptyKind(): { rows: never[]; total: number; knownCount: number } {
  // ADR-2 Option A: return empty gated result.
  // Metagaming leak is closed (no data leaks through), resolver deferred.
  // TODO: wire UUID-based resolver in follow-up slice (codex-knowledge #1946).
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
 * monsters: full catalog + known flags (ADR-2 Option A, real round-trip).
 * npcs/factions/locations/lore: gated-EMPTY (ADR-2 Option A, deferred).
 *
 * For DM/devMode effectiveView='dm': all entries + known flag.
 * For player effectiveView='player': ONLY known entries (seesEntry gate).
 *
 * REQ-CCB-API-01, REQ-CK-GATE-03, GATE-04, codex-knowledge SDD design #1948.
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
    case 'npcs':
    case 'factions':
    case 'locations':
    case 'lore': {
      // ADR-2 Option A: gated-empty. Metagaming leak closed for all 5 categories.
      // TODO: wire UUID-based resolver in follow-up slice (codex-knowledge #1946).
      const { rows, total, knownCount } = readGatedEmptyKind();
      return { rows, total, knownCount, effectiveView };
    }
  }
}
