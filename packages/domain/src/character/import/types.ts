/**
 * Character import envelope — shape validation + compendium reference
 * extraction.
 *
 * Mirrors the API's `CharacterExportEnvelope` (apps/api/src/http/routes/characters.ts,
 * GET /characters/:id/export). This module is the inverse of export: given an
 * untrusted envelope, verify its shape and extract every compendium reference
 * the importer must resolve (race, subrace, class, subclass, background,
 * spell, item) before persisting. Pure — no IO. The API use-case resolves the
 * extracted refs against the DB and performs the actual insert.
 */

export type CharacterImportStatus =
  | 'draft'
  | 'active'
  | 'retired'
  | 'dead'
  | 'pending_approval';

export interface CharacterImportEnvelope {
  schemaVersion: 1;
  exportedAt: string;
  character: {
    id: string;
    name: string;
    worldId: string;
    status: CharacterImportStatus;
    xp: number;
    data: Record<string, unknown>;
    inventory: unknown[];
  };
}

/** Kinds of compendium entity a character can reference. */
export type CompendiumRefKind =
  | 'race'
  | 'subrace'
  | 'class'
  | 'subclass'
  | 'background'
  | 'spell'
  | 'item';

export interface CompendiumRef {
  kind: CompendiumRefKind;
  slug: string;
  source: string;
}

export type ImportEnvelopeIssue =
  | { code: 'MALFORMED_ENVELOPE'; path: string; message: string }
  | { code: 'SCHEMA_VERSION_UNSUPPORTED'; expected: 1; got: number };

export type ImportEnvelopeValidationResult =
  | { ok: true; envelope: CharacterImportEnvelope; refs: CompendiumRef[] }
  | { ok: false; issues: ImportEnvelopeIssue[] };
