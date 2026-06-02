import { and, eq } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';
import { characterKnowledge, compendiumMonsters } from '../../infra/db/schema.js';
import { seesEntry, isMonsterKnownByDefault } from '@dungeon-hub/domain/character/knowledge';

export type EffectiveView = 'dm' | 'player';

export interface BestiaryMonsterRow {
  slug: string;
  source: string;
  name: string;
  cr: string | null;
  type: string | null;
  size: string | null;
  /** True if this character has a knowledge row for this monster. */
  known: boolean;
}

export interface ReadBestiaryResult {
  monsters: BestiaryMonsterRow[];
  total: number;
  knownCount: number;
}

/**
 * Reads the bestiary for a character, projected against compendium_monsters.
 *
 * For DM view: all compendium monsters + known flag.
 * For player view: ONLY monsters the character knows (seesEntry gate applied).
 *
 * The domain seesEntry() function enforces the layered visibility gate:
 *   Layer 1 (world-visibility): DM bypasses all layers.
 *   Layer 2 (knowledge gate): player needs a knowledge row.
 *
 * NOTE: bestiary entries are never "DM-secret" in Slice 1 (isSecret=false always).
 * The DM-secret axis is deferred to Slice 2+ when individual entries get a secret flag.
 *
 * REQ-CK-API-02, REQ-CK-GATE-01, REQ-CK-GATE-02 (spec #1626)
 */
export async function readBestiary(
  characterId: string,
  effectiveView: EffectiveView,
): Promise<ReadBestiaryResult> {
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

  // Load character's known bestiary entries
  const knownRows = await db
    .select({
      refKey: characterKnowledge.refKey,
      refSource: characterKnowledge.refSource,
    })
    .from(characterKnowledge)
    .where(
      and(
        eq(characterKnowledge.characterId, characterId),
        eq(characterKnowledge.kind, 'bestiary'),
      ),
    );

  // Build a fast lookup set: "slug|source"
  const knownSet = new Set(knownRows.map((r) => `${r.refKey}|${r.refSource}`));

  const defaulted = isMonsterKnownByDefault();
  const total = allMonsters.length;
  let knownCount = 0;

  const monsters: BestiaryMonsterRow[] = [];

  for (const m of allMonsters) {
    const knows = knownSet.has(`${m.slug}|${m.source}`);
    if (knows) knownCount++;

    // Apply layered visibility gate (no DM-secret flag in Slice 1)
    const visible = seesEntry(effectiveView, false, knows, defaulted);

    if (effectiveView === 'dm') {
      // DM sees all with known flag
      monsters.push({ ...m, known: knows });
    } else {
      // Player only sees visible (known) entries
      if (visible) {
        monsters.push({ ...m, known: true });
      }
    }
  }

  return { monsters, total, knownCount };
}
