/**
 * Tests for RulesProfileSchema — shopCuration key (S1, sub-slice 3d).
 * No DB migration required: existing stored profiles backfill via Zod
 * `.default()`, matching the `languages` key precedent (#807, see
 * DisabledEntitiesSchema in ./types.ts).
 */
import { describe, expect, it } from 'vitest';
import { RulesProfileSchema } from './types.js';
import { DEFAULT_RULES_PROFILE } from './default.js';

function profileWithout<T extends Record<string, unknown>>(
  extra: Partial<T> = {},
): Record<string, unknown> {
  const { shopCuration: _omit, ...rest } = DEFAULT_RULES_PROFILE as unknown as Record<
    string,
    unknown
  > & { shopCuration?: unknown };
  return { ...rest, ...extra };
}

describe('RulesProfileSchema — shopCuration backfill', () => {
  it('parses a stored profile without shopCuration and backfills disabled + empty forSale', () => {
    const parsed = RulesProfileSchema.parse(profileWithout());
    expect(parsed.shopCuration).toEqual({ enabled: false, forSale: [] });
  });

  it('round-trips a profile with shopCuration enabled and a populated forSale list', () => {
    const input = {
      ...profileWithout(),
      shopCuration: { enabled: true, forSale: ['longsword|PHB'] },
    };
    const parsed = RulesProfileSchema.parse(input);
    expect(parsed.shopCuration).toEqual({ enabled: true, forSale: ['longsword|PHB'] });
  });
});
