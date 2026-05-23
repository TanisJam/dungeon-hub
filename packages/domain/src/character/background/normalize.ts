/**
 * Read-time normalizer for AppliedBackground.
 *
 * Accepts any prior-shape save (including legacy saves without `customization`)
 * and returns the current-shape AppliedBackground. Idempotent.
 *
 * Strictness rules (decision #505):
 *   - Throws on missing slug or source (unrecoverable — surfaces corruption loudly)
 *   - Strips corrupt customization sub-tree (returns customization: undefined)
 *     so the wizard re-prompts on next edit; no data loss at root level
 *
 * Call sites: API character loader + web wizard deriveChoices.
 */
import { z } from 'zod';
import { CustomizationSchema } from './schemas.js';
import type { AppliedBackground, Customization } from './types.js';

const RootSchema = z.object({
  slug: z.string().min(1),
  source: z.string().min(1),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  customization: z.unknown().optional(),
});

/**
 * Normalizes any prior-shape AppliedBackground save to the current shape.
 *
 * @param input - Unknown input from DB, web, or tests.
 * @returns Current-shape AppliedBackground.
 * @throws ZodError if slug or source is missing/empty (unrecoverable corruption).
 */
export function normalizeAppliedBackground(input: unknown): AppliedBackground {
  // Throws ONLY if slug/source missing — by design (decision #505).
  const root = RootSchema.parse(input);

  const customizationParse = CustomizationSchema.safeParse(root.customization);

  const base: AppliedBackground = {
    slug: root.slug,
    source: root.source,
    skills: root.skills ?? [],
    languages: root.languages ?? [],
    tools: root.tools ?? [],
  };

  if (customizationParse.success) {
    // Cast needed: Zod's inferred optional sub-fields include `| undefined`
    // which doesn't match `exactOptionalPropertyTypes`. The cast is safe because
    // the runtime values are identical — Zod only sets a key when it's present.
    base.customization = customizationParse.data as Customization;
  }

  return base;
}
