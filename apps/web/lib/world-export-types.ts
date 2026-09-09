/**
 * Web-side mirror of the API's WorldExportEnvelope.
 * Returned by GET /worlds/:worldId/export.
 * See apps/api/src/use-cases/worlds/export-world.ts for the authoritative shape.
 *
 * Field types here are kept loose (unknown/Record) rather than fully mirroring
 * every world-entity interface — the web layer only needs this to build a
 * filename and hand the JSON to a Blob, never to read into individual fields.
 */
export interface WorldExportEnvelope {
  schemaVersion: 1;
  exportedAt: string; // ISO 8601 UTC
  world: {
    name: string;
    rulesProfile: unknown;
    npcs: unknown[];
    factions: unknown[];
    quests: unknown[];
    hexes: unknown[];
    pois: unknown[];
    journal: unknown[];
  };
}
