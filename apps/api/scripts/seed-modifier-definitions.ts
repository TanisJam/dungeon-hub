/**
 * Seeds the modifier_definitions table with known rule documents.
 * Idempotent: upserts on slug conflict.
 *
 * REQ-MDSEED-01 (spec sdd/engine-catalog/spec):
 *   - Validates each RuleDoc via parseRule BEFORE insert. Invalid → process.exit(1).
 *   - Re-run safe: ON CONFLICT (slug) DO UPDATE.
 *
 * Uso: pnpm seed-modifier-definitions
 */

import { cloakOfProtectionRuleDoc } from '@dungeon-hub/domain/engine';
import { parseRule } from '@dungeon-hub/domain/engine';
import { db } from '../src/infra/db/client.js';
import { modifierDefinitions } from '../src/infra/db/schema.js';

interface SeedEntry {
  slug: string;
  source: string;
  name: string;
  kind: string;
  ruleDoc: unknown;
}

const ENTRIES: SeedEntry[] = [
  {
    slug: 'cloak-of-protection',
    source: 'DMG 159',
    name: 'Cloak of Protection',
    kind: 'item',
    ruleDoc: cloakOfProtectionRuleDoc,
  },
];

async function main() {
  console.log('Seeding modifier_definitions...');

  for (const entry of ENTRIES) {
    // REQ-MDSEED-01 Scenario C: validate BEFORE insert — loud fail on invalid RuleDoc.
    const parseResult = parseRule(entry.ruleDoc);
    if (!parseResult.ok) {
      console.error(
        `[seed-modifier-definitions] INVALID RuleDoc for slug="${entry.slug}":`,
        JSON.stringify(parseResult.issues, null, 2),
      );
      process.exit(1);
    }

    await db
      .insert(modifierDefinitions)
      .values({
        slug: entry.slug,
        source: entry.source,
        name: entry.name,
        kind: entry.kind,
        ruleDoc: entry.ruleDoc,
      })
      .onConflictDoUpdate({
        target: modifierDefinitions.slug,
        set: {
          ruleDoc: entry.ruleDoc as Record<string, unknown>,
          source: entry.source,
          name: entry.name,
          kind: entry.kind,
        },
      });

    console.log(`  [ok] ${entry.slug} (${entry.source})`);
  }

  console.log(`Done: ${ENTRIES.length} definition(s) seeded.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed-modifier-definitions] Failed:', err);
  process.exit(1);
});
