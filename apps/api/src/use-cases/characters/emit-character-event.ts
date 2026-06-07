import type { DbOrTx } from '../../infra/db/client.js';
import { upsertCharacterKnowledge } from './upsert-character-knowledge.js';

export interface CharacterEventInput {
  characterId: string;
  worldId: string;
  /** Event type: 'bestiary_discovered' | 'item_granted' | … (extensible). */
  type: string;
  /** Compendium slug (refKey). */
  refKey: string;
  /** Compendium source (refSource). */
  refSource: string;
  /** Optional session ID for session-scoped events (Slice 2 auto-unlock). */
  sessionId?: string | null;
  /** Optional payload for future event log (character_events — Wave 2). */
  payload?: Record<string, unknown>;
  /** User who triggered the event. NULL for system-generated events. */
  grantedByUserId?: string | null;
}

/**
 * Thin shared-hook helper for character events (ADR-4).
 *
 * Emits a character event and dispatches to all registered consumers within
 * the same transaction. Currently the ONLY consumer is `upsertCharacterKnowledge`.
 * A future `character_events` writer subscribes to the SAME call site — zero
 * pipeline duplication (one tx, both consumers).
 *
 * Called INSIDE the mutating transaction from both:
 *   - DM grant route (POST /characters/:id/knowledge)
 *   - Encounter combatant-add-with-slug hook (Slice 2)
 *
 * REQ-CK-S2-AUTOUNLOCK-01 (spec #1626)
 */
export async function emitCharacterEvent(
  tx: DbOrTx,
  input: CharacterEventInput,
): Promise<void> {
  // Derive knowledge kind from event type
  const kind = resolveKind(input.type);

  // Consumer 1 (Slice 1): upsert character knowledge row
  if (kind) {
    await upsertCharacterKnowledge({
      tx,
      characterId: input.characterId,
      worldId: input.worldId,
      kind,
      refKey: input.refKey,
      refSource: input.refSource,
      source: input.grantedByUserId ? 'dm-grant' : 'encounter',
      grantedByUserId: input.grantedByUserId ?? null,
    });
  }

  // Consumer 2 (Wave 2): character_events table write — SAME call site, not yet wired.
  // When this lands: await insertCharacterEvent(tx, { ... });
}

/**
 * Maps an event type to a knowledge kind.
 * Returns null for unrecognized event types (no knowledge row produced).
 */
function resolveKind(
  type: string,
): 'bestiary' | 'item' | 'spell' | 'npc' | 'faction' | 'location' | 'lore' | null {
  switch (type) {
    case 'bestiary_discovered': return 'bestiary';
    case 'item_granted': return 'item';
    case 'spell_learned': return 'spell';
    case 'npc_met':
    // uuid-bridge-npc B-2: DM grant sends type='npc_discovered' (mirrors bestiary_discovered convention).
    // Both aliases produce the same knowledge row kind='npc'.
    case 'npc_discovered': return 'npc';
    case 'faction_encountered': return 'faction';
    case 'location_discovered': return 'location';
    case 'lore_learned': return 'lore';
    default: return null;
  }
}
