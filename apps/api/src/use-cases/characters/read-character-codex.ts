import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characterKnowledge, compendiumMonsters } from '../../infra/db/schema.js';
import { seesEntry, isMonsterKnownByDefault } from '@dungeon-hub/domain/character/knowledge';

export type EffectiveView = 'dm' | 'player';

/**
 * Supported URL/API kind values for the codex read endpoint.
 * Maps to DB character_knowledge.kind values via KIND_TO_DB_KIND.
 *
 * URL kind | DB kind    | Notes
 * -------- | ---------- | ---------------------------------------------------
 * monsters | bestiary   | The URL key is 'monsters' to match the compendium
 *           |            | category (GET /compendium/monsters). The DB enum
 *           |            | stays 'bestiary' — do NOT rename it; the grant
 *           |            | route + upsert-character-knowledge.ts use 'bestiary'.
 *           |            | This mapping is the intentional seam (ADR-1, CCB).
 */
export type CodexKind = 'monsters';

/**
 * DB-level kind enum for character_knowledge.kind.
 * Always use this when querying the DB — not the URL kind.
 */
type DbKind = 'bestiary';

/**
 * Maps URL/API codex kind → DB character_knowledge.kind.
 * This is the ONLY place the translation lives (monsters → bestiary).
 * Do NOT add this mapping elsewhere; route it through here.
 */
const KIND_TO_DB_KIND: Record<CodexKind, DbKind> = {
  monsters: 'bestiary',
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

// ---------------------------------------------------------------------------
// Per-kind query helpers
// ---------------------------------------------------------------------------

async function readMonstersKind(
  characterId: string,
  effectiveView: EffectiveView,
): Promise<{ rows: CodexMonsterRow[]; total: number; knownCount: number }> {
  // Load all compendium monsters
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

  return { rows, total, knownCount };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads the character's scoped codex for the given kind.
 *
 * URL kind → DB kind mapping:
 *   'monsters' → character_knowledge.kind = 'bestiary'
 *
 * For DM effectiveView: all compendium entries + known flag.
 * For player effectiveView: ONLY entries the character knows (seesEntry gate applied).
 *
 * REQ-CCB-API-01 (spec character-codex-browser).
 */
export async function readCharacterCodexCategory(
  characterId: string,
  kind: CodexKind,
  effectiveView: EffectiveView,
): Promise<ReadCharacterCodexResult> {
  // This switch is the extension point for future codex kinds (items, spells, etc.)
  // Each kind maps to its own DB table + per-kind row projection.
  // The DB enum for character_knowledge.kind is validated here via KIND_TO_DB_KIND.
  void KIND_TO_DB_KIND[kind]; // static check — kind must be a valid CodexKind

  switch (kind) {
    case 'monsters': {
      const { rows, total, knownCount } = await readMonstersKind(characterId, effectiveView);
      return { rows, total, knownCount, effectiveView };
    }
  }
}
