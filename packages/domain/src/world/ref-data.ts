/**
 * WorldRefData — the resolved reference-data bag for a single world.
 *
 * Validators in `packages/domain` receive this from the caller (API use-case)
 * instead of importing hardcoded constants. The API resolves it from
 * `compendium_*` tables filtered by the world's `rulesProfile`.
 *
 * Origin: SDD `domain-reference-data-runtime-source` (engram #807).
 * Closes: engram #513 (DB as runtime source of truth, per CLAUDE.md §1.2).
 */
import { z } from 'zod';

export const LanguagePoolSchema = z.object({
  /** Standard languages enabled by the world's rulesProfile (post-disabledEntities). */
  standard: z.array(z.string()).readonly(),
  /** Exotic languages enabled by the world's rulesProfile (post-disabledEntities). */
  exotic: z.array(z.string()).readonly(),
});

export const WorldRefDataSchema = z.object({
  languagePool: LanguagePoolSchema,
  /** Race keys (`slug|SOURCE`) that REQUIRE a subrace selection per RAW. */
  subraceRequiredSet: z.set(z.string()),
  /** Subrace keys (`slug|SOURCE`) whose ASI replaces the parent race's. */
  subraceReplacingAbilitySet: z.set(z.string()),
});

export type LanguagePool = z.infer<typeof LanguagePoolSchema>;
export type WorldRefData = z.infer<typeof WorldRefDataSchema>;
