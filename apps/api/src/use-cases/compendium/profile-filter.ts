import { sql, and, inArray, notInArray, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { enabledSources, type RulesProfile } from '@dungeon-hub/domain/rules-profile';

/**
 * Construye las condiciones WHERE que aplican un Rules Profile a un compendium table.
 *
 *   1. source debe estar en la whitelist de enabled sources.
 *   2. (slug || '|' || source) no debe estar en disabledEntities[kind].
 *
 * Devuelve null si el profile no tiene ninguna source habilitada (ningún resultado).
 */
export function profileFilterConditions(args: {
  profile: RulesProfile;
  kind: keyof RulesProfile['disabledEntities'];
  slugCol: AnyPgColumn;
  sourceCol: AnyPgColumn;
}): SQL | null {
  const sources = enabledSources(args.profile);
  if (sources.length === 0) return null;

  const disabledKeys = args.profile.disabledEntities[args.kind];

  const conditions: SQL[] = [inArray(args.sourceCol, sources)];

  if (disabledKeys.length > 0) {
    conditions.push(
      notInArray(sql`${args.slugCol} || '|' || ${args.sourceCol}`, disabledKeys),
    );
  }

  return and(...conditions) ?? null;
}
