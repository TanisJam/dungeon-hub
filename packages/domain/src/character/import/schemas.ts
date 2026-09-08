/**
 * Zod shape schema for the character import envelope. Shared between the
 * domain shape check (validateImportEnvelope) and the API request body.
 *
 * `schemaVersion` is typed as `z.number()`, NOT `z.literal(1)`: an
 * unsupported version is a business-rule mismatch (SCHEMA_VERSION_UNSUPPORTED,
 * carrying expected/got per CLAUDE.md §6), not a generic shape error, so
 * validateImportEnvelope checks it explicitly after the shape parse succeeds.
 */
import { z } from 'zod';

const CharacterImportStatusSchema = z.enum([
  'draft',
  'active',
  'retired',
  'dead',
  'pending_approval',
]);

export const CharacterImportEnvelopeSchema = z.object({
  schemaVersion: z.number(),
  exportedAt: z.string(),
  character: z.object({
    id: z.string(),
    name: z.string(),
    worldId: z.string(),
    status: CharacterImportStatusSchema,
    xp: z.number(),
    data: z.record(z.string(), z.unknown()),
    inventory: z.array(z.unknown()),
  }),
});
