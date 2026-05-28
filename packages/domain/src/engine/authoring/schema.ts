/**
 * Zod schema for ProficiencyMod — the 10th modifier kind.
 *
 * Design ref: sdd/authoring-dsl/design — Decision 3, REQ-PROF-01.
 *
 * `domain` is a CLOSED enum of 6 values (PHB proficiency categories).
 * `ref` is a FREE string (z.string().min(1)) — homebrew skills, custom tools,
 *   and any future DM-defined entries must pass without list validation.
 *
 * // TODO #513: runtime ref validation against DB catalog is deferred.
 *   When the DB-injected proficiency resolver lands, the Zod schema stays as-is
 *   (open ref) and validation against the catalog moves to the use-case layer.
 */
import { z } from 'zod';

export const ProficiencyModSchema = z.object({
  kind: z.literal('proficiency'),
  domain: z.enum(['skill', 'save', 'tool', 'language', 'weapon', 'armor']),
  ref: z.string().min(1), // TODO #513: future DB-injected resolver for ref validation
  level: z.enum(['proficient', 'expertise']).optional(),
});

export type ProficiencyModSchemaInput = z.input<typeof ProficiencyModSchema>;
export type ProficiencyModSchemaOutput = z.output<typeof ProficiencyModSchema>;
