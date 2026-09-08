import { CharacterImportEnvelopeSchema } from './schemas.js';
import { extractCompendiumRefs } from './extract-refs.js';
import type { CharacterImportEnvelope, ImportEnvelopeValidationResult } from './types.js';

const SUPPORTED_SCHEMA_VERSION = 1 as const;

/**
 * Validates the shape of a character import envelope and, when valid,
 * extracts every compendium reference it carries.
 *
 * Two independent failure modes, each with its own issue code:
 *   - MALFORMED_ENVELOPE: the input doesn't match the envelope shape at all
 *     (missing/mistyped fields). One issue per offending path.
 *   - SCHEMA_VERSION_UNSUPPORTED: the shape is fine but schemaVersion isn't 1.
 *
 * Pure — no IO. Reference *resolution* against the compendium DB is the API
 * use-case's job (import-character.ts); this function only extracts what an
 * importer would need to resolve.
 */
export function validateImportEnvelope(input: unknown): ImportEnvelopeValidationResult {
  const parsed = CharacterImportEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'MALFORMED_ENVELOPE' as const,
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const envelope = parsed.data;
  if (envelope.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_VERSION_UNSUPPORTED',
          expected: SUPPORTED_SCHEMA_VERSION,
          got: envelope.schemaVersion,
        },
      ],
    };
  }

  const refs = extractCompendiumRefs(envelope.character.data, envelope.character.inventory);

  const normalized: CharacterImportEnvelope = {
    ...envelope,
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
  };

  return { ok: true, envelope: normalized, refs };
}
