/**
 * buildSharedContribution — pure mapper from a BitacoraPageSnapshot to
 * the insert payload shape for guild_contributions.
 *
 * No IO, no DB, no fetch. Accepts the page data and returns the fields
 * needed to INSERT a new guild_contributions row (snapshot-copy).
 *
 * Refs: refs[0] is carried into (refEntityKind, refEntityId, refEntitySource).
 * Kind normalization: page kind 'monster' → contribution kind 'bestiary' (ADR-2).
 * Single-ref policy: only refs[0] is carried; additional refs are ignored.
 * Empty/absent refs → all three ref fields null (preserves current behavior).
 *
 * guild-feed-linked-entity-refs SDD spec REQ-GFLE-02/03, design ADR-2/ADR-3.
 * bitacora-personal-share SDD spec #2035 REQ-SHARE-01/REQ-SHARE-08 ADR-4.
 */

export interface BitacoraPageRef {
  kind: string;
  refKey: string;
  refSource: string;
}

export interface BitacoraPageSnapshot {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  worldId: string;
  authorUserId: string;
  /** Optional structured refs from the bitácora page. Only refs[0] is carried. */
  refs?: BitacoraPageRef[];
}

export interface SharedContributionPayload {
  /** 'nota' — confirmed ∈ CONTRIBUTION_TYPE_SEED (validate.ts:56). */
  contributionType: 'nota';
  body: string;
  tags: string[];
  /** Snapshot of the page's title. null when the source page has no title. */
  title: string | null;
  /** All shared contributions are guild-visible (REQ-SHARE-06). */
  visibility: 'guild';
  /** Back-link FK to the source bitacora_pages row (ADR-1). */
  sourceBitacoraPageId: string;
  /**
   * Normalized entity kind from refs[0] (if present), else null.
   * 'monster' normalized to 'bestiary' at write boundary (ADR-2).
   * Possible values: 'bestiary' | 'npc' | 'faction' | 'location' | null.
   */
  refEntityKind: string | null;
  /**
   * Entity key from refs[0].refKey (if present), else null.
   * Compendium slug for bestiary; UUID for world entities.
   */
  refEntityId: string | null;
  /**
   * Entity source from refs[0].refSource (if present), else null.
   * Book identifier (e.g. 'MM', 'PHB') for bestiary; 'world' for UUID kinds.
   * guild-feed-linked-entity-refs REQ-GFLE-03.
   */
  refEntitySource: string | null;
}

/**
 * Maps a page-level entity kind to the canonical contribution store kind.
 * 'monster' → 'bestiary' (pages use 'monster'; contributions store 'bestiary').
 * All other kinds pass through unchanged.
 *
 * This is the ONLY place this normalization lives at the share write boundary.
 * ADR-2: canonical store vocabulary = bestiary | npc | faction | location.
 */
function normalizeKind(kind: string): string {
  if (kind === 'monster') return 'bestiary';
  return kind;
}

/**
 * Builds the insert payload for a guild_contributions row from a personal
 * bitácora page snapshot.
 *
 * @param page - The source BitacoraPageSnapshot (already validated at write time).
 * @returns SharedContributionPayload ready for INSERT.
 */
export function buildSharedContribution(page: BitacoraPageSnapshot): SharedContributionPayload {
  const ref = page.refs?.[0] ?? null;

  return {
    contributionType: 'nota',
    body: page.body,
    tags: page.tags,
    title: page.title ?? null,
    visibility: 'guild',
    sourceBitacoraPageId: page.id,
    refEntityKind: ref ? normalizeKind(ref.kind) : null,
    refEntityId: ref ? ref.refKey : null,
    refEntitySource: ref ? ref.refSource : null,
  };
}
