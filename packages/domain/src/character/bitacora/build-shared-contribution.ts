/**
 * buildSharedContribution — pure mapper from a BitacoraPageSnapshot to
 * the insert payload shape for guild_contributions.
 *
 * No IO, no DB, no fetch. Accepts the page data and returns the fields
 * needed to INSERT a new guild_contributions row (snapshot-copy).
 *
 * Structured refs (refs[]) are NOT copied in v1 — deferred to UUID bridge #1946.
 * refEntityKind and refEntityId are always null on the produced payload.
 *
 * bitacora-personal-share SDD spec #2035 REQ-SHARE-01/REQ-SHARE-08 ADR-4.
 */

export interface BitacoraPageSnapshot {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  worldId: string;
  authorUserId: string;
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
   * Structured refs are NOT copied in v1 — deferred to UUID bridge #1946.
   * refEntityKind remains null.
   */
  refEntityKind: null;
  /**
   * Structured refs are NOT copied in v1 — deferred to UUID bridge #1946.
   * refEntityId remains null.
   */
  refEntityId: null;
}

/**
 * Builds the insert payload for a guild_contributions row from a personal
 * bitácora page snapshot.
 *
 * @param page - The source BitacoraPageSnapshot (already validated at write time).
 * @returns SharedContributionPayload ready for INSERT.
 */
export function buildSharedContribution(page: BitacoraPageSnapshot): SharedContributionPayload {
  return {
    contributionType: 'nota',
    body: page.body,
    tags: page.tags,
    title: page.title ?? null,
    visibility: 'guild',
    sourceBitacoraPageId: page.id,
    refEntityKind: null,
    refEntityId: null,
  };
}
