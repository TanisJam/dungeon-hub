/**
 * cleanup-dev-data.ts
 *
 * Wipes accumulated game/user content from the dev database.
 * Safe for dev hygiene — fixes the "slow dashboard from thousands of test characters" problem.
 *
 * WHAT IT DELETES (accumulated game content):
 *   encounter_combatant_effects, encounter_combatant_conditions, encounter_combatants,
 *   encounters, session_events, session_participants, sessions, character_concentration,
 *   modifier_instances, characters, journal_entries, world_events, npcs, factions,
 *   hexes, pois, campaign_members, campaigns, world_members, worlds, discord_link_tokens
 *
 * WHAT IT KEEPS (reference data + auth):
 *   compendium_* tables (races, classes, subclasses, backgrounds, spells, items,
 *     monsters, feats, optional_features, conditions, languages, actions),
 *   modifier_definitions (engine rule docs),
 *   users (auth-linked profiles — logins are preserved).
 *   drizzle migrations table (obviously).
 *
 * NOTE: Supabase GoTrue auth.users accumulate separately. This script does NOT
 *   delete auth users (they live in a different schema with different permissions).
 *   If test auth users need purging, do that via the Supabase dashboard or GoTrue API.
 *
 * SAFETY: refuses to run in NODE_ENV=production, and refuses if DATABASE_URL
 *   does not point at a local/dev host (127.0.0.1 / localhost / ::1).
 *
 * IDEMPOTENT: re-running on an already-clean DB deletes 0 rows and exits 0.
 *
 * Usage: pnpm db:cleanup
 */

import { db } from '../src/infra/db/client.js';
import { env } from '../src/env.js';
import {
  encounterCombatantEffects,
  encounterCombatantConditions,
  encounterCombatants,
  encounters,
  sessionEvents,
  sessionParticipants,
  sessions,
  characterConcentration,
  modifierInstances,
  characters,
  journalEntries,
  worldEvents,
  npcs,
  factions,
  pois,
  hexes,
  campaignMembers,
  campaigns,
  worldMembers,
  worlds,
  discordLinkTokens,
} from '../src/infra/db/schema.js';

// ---------------------------------------------------------------------------
// Safety guards
// ---------------------------------------------------------------------------

if (env.NODE_ENV === 'production') {
  console.error('[cleanup-dev-data] REFUSED: NODE_ENV=production. This command is dev-only.');
  process.exit(1);
}

function isLocalHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

if (!isLocalHost(env.DATABASE_URL)) {
  console.error(
    '[cleanup-dev-data] REFUSED: DATABASE_URL does not point at a local host.',
    'This command is dev-only and must only run against localhost.',
  );
  console.error('  DATABASE_URL host:', new URL(env.DATABASE_URL).hostname);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Deletion plan (FK-safe order — children before parents)
//
// Dependency chain (inferred from schema.ts FK references):
//
//   encounter_combatant_effects  → encounter_combatants
//   encounter_combatant_conditions → encounter_combatants
//   encounter_combatants         → encounters, characters (set null)
//   encounters                   → campaigns, sessions (set null)
//   session_events               → sessions
//   session_participants         → sessions, characters
//   sessions                     → campaigns
//   character_concentration      → characters
//   modifier_instances           → characters
//   characters                   → worlds, users
//   journal_entries              → campaigns
//   world_events                 → campaigns, sessions (set null)
//   npcs                         → campaigns, factions (set null), hexes (set null)
//   factions                     → campaigns
//   pois                         → hexes
//   hexes                        → campaigns, parent_hex_id self-FK (cascade)
//   campaign_members             → campaigns, users
//   campaigns                    → worlds
//   world_members                → worlds, users
//   worlds                       → users (restrict — so worlds must go before worlds)
//   discord_link_tokens          → users
//
// Correct leaf-to-root order:
//   1. encounter_combatant_effects  (leaf — refs combatants)
//   2. encounter_combatant_conditions (leaf — refs combatants)
//   3. encounter_combatants         (refs encounters, characters)
//   4. encounters                   (refs campaigns, sessions)
//   5. session_events               (refs sessions)
//   6. session_participants         (refs sessions, characters)
//   7. sessions                     (refs campaigns)
//   8. character_concentration      (refs characters)
//   9. modifier_instances           (refs characters)
//  10. characters                   (refs worlds)
//  11. journal_entries              (refs campaigns)
//  12. world_events                 (refs campaigns, sessions — set null already handled)
//  13. npcs                         (refs campaigns, factions/hexes — set null)
//  14. factions                     (refs campaigns)
//  15. pois                         (refs hexes)
//  16. hexes                        (refs campaigns; self-FK cascade handles sub-hexes)
//  17. campaign_members             (refs campaigns)
//  18. campaigns                    (refs worlds)
//  19. world_members                (refs worlds)
//  20. worlds                       (leaf among game content; restricted by users — deleted last)
//  21. discord_link_tokens          (refs users — delete before users would be touched,
//                                   but we are NOT deleting users here)
// ---------------------------------------------------------------------------

type TableDef = Parameters<typeof db.delete>[0];

const DELETION_ORDER: { label: string; table: TableDef }[] = [
  { label: 'encounter_combatant_effects',    table: encounterCombatantEffects },
  { label: 'encounter_combatant_conditions', table: encounterCombatantConditions },
  { label: 'encounter_combatants',           table: encounterCombatants },
  { label: 'encounters',                     table: encounters },
  { label: 'session_events',                 table: sessionEvents },
  { label: 'session_participants',           table: sessionParticipants },
  { label: 'sessions',                       table: sessions },
  { label: 'character_concentration',        table: characterConcentration },
  { label: 'modifier_instances',             table: modifierInstances },
  { label: 'characters',                     table: characters },
  { label: 'journal_entries',               table: journalEntries },
  { label: 'world_events',                  table: worldEvents },
  { label: 'npcs',                          table: npcs },
  { label: 'factions',                      table: factions },
  { label: 'pois',                          table: pois },
  { label: 'hexes',                         table: hexes },
  { label: 'campaign_members',              table: campaignMembers },
  { label: 'campaigns',                     table: campaigns },
  { label: 'world_members',                 table: worldMembers },
  { label: 'worlds',                        table: worlds },
  { label: 'discord_link_tokens',           table: discordLinkTokens },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[cleanup-dev-data] Starting dev data cleanup...');
  console.log(`  NODE_ENV : ${env.NODE_ENV}`);
  console.log(`  DB host  : ${new URL(env.DATABASE_URL).hostname}:${new URL(env.DATABASE_URL).port}`);
  console.log('');

  const summary: { label: string; deleted: number }[] = [];
  let totalDeleted = 0;

  await db.transaction(async (tx) => {
    for (const { label, table } of DELETION_ORDER) {
      // Drizzle delete with no .where() = DELETE FROM <table> (all rows)
      const result = await tx.delete(table as Parameters<typeof tx.delete>[0]);
      // postgres-js returns an array; its length is the affected-row count
      const count = Array.isArray(result) ? result.length : 0;
      summary.push({ label, deleted: count });
      totalDeleted += count;
      if (count > 0) {
        console.log(`  [deleted] ${label}: ${count} row(s)`);
      }
    }
  });

  console.log('');
  console.log('--- Summary ---');
  for (const { label, deleted } of summary) {
    if (deleted > 0) {
      console.log(`  ${label.padEnd(40)} ${deleted}`);
    }
  }
  console.log(`  ${'TOTAL'.padEnd(40)} ${totalDeleted}`);
  console.log('');

  if (totalDeleted === 0) {
    console.log('[cleanup-dev-data] Nothing to delete — DB is already clean.');
  } else {
    console.log('[cleanup-dev-data] Done. Compendium and modifier_definitions are untouched.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[cleanup-dev-data] Failed:', err);
  process.exit(1);
});
