/**
 * Zod schemas for Custom Background customization.
 * Shared between API (SetBackgroundBody) and web (client-side validation).
 * Single source of truth — import from '@dungeon-hub/domain/character/background'.
 */
import { z } from 'zod';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

export const MixedPoolSelectionSchema = z.object({
  shape: z.enum(['lang2', 'lang1tool1', 'tool2']),
  langs: z.array(z.string().min(1)),
  tools: z.array(z.string().min(1)),
});

export const EquipmentSelectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('package'),
    backgroundSlug: z.string().min(1),
    backgroundSource: z.string().min(1),
    choiceSlot: z.enum(['a', 'b', 'c', 'd']).optional(),
  }),
  z.object({ kind: z.literal('coin') }),
]);

export const FeatureSelectionSchema = z.object({
  slug: z.string().min(1),
});

// ── Customization root ────────────────────────────────────────────────────────

export const CustomizationSchema = z.object({
  mixedPool: MixedPoolSelectionSchema.optional(),
  equipment: EquipmentSelectionSchema.optional(),
  feature: FeatureSelectionSchema.optional(),
});

// ── API body schema (alias — same shape, shared between web + api) ────────────

export const SetBackgroundBodyCustomizationSchema = CustomizationSchema;

// ── AppliedBackground (full shape, including optional customization) ───────────

export const AppliedBackgroundSchema = z.object({
  slug: z.string().min(1),
  source: z.string().min(1),
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  tools: z.array(z.string()),
  customization: CustomizationSchema.optional(),
});
