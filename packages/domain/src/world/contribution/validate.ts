/**
 * Guild contributions domain functions — pure rules (no IO, no DB, no fetch).
 *
 * FORK 4 (#1944): guild_contributions is append-only, personal→guild→canonical
 * visibility promotion, DM seals with confirmed|debunked. West Marches
 * misinformation-as-feature design intent.
 *
 * All functions return { ok: true } | { ok: false; issues: Issue[] } or booleans.
 * Issue codes follow CLAUDE.md §6: single-value-mismatch → got/expected.
 *
 * // TODO #513: contributionType seed list to be projected from DB when
 * // DB-as-runtime-SoT lands (codex-knowledge OQ1 resolution #1946).
 *
 * REQ-CK-NOTE-06, REQ-CK-NOTE-07, REQ-CK-NOTE-08, REQ-CK-DOMAIN-01.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContributionVisibility = 'personal' | 'guild' | 'canonical';
export type SealedStatus = 'confirmed' | 'debunked' | null;

export interface ContributionView {
  id: string;
  body: string;
  authorUserId: string;
  contributionType: string;
  visibility: ContributionVisibility;
  sealedStatus: SealedStatus;
  sealedBy: string | null;
  sealedAt: Date | null;
}

export interface ContributionIssue {
  code: string;
  got?: string;
  expected?: string;
  message?: string;
}

type ValidateContributionResult =
  | { ok: true }
  | { ok: false; issues: ContributionIssue[] };

// ---------------------------------------------------------------------------
// Seed list for contributionType (OPEN text — domain validates against this).
// // TODO #513: project from DB rules_profile when DB-as-runtime-SoT lands.
// ---------------------------------------------------------------------------
const CONTRIBUTION_TYPE_SEED: ReadonlySet<string> = new Set([
  'sighting',
  'rumor',
  'nota',
  'mapa',
  'encuentro',
  'otro',
]);

const VALID_VISIBILITY: ReadonlySet<string> = new Set<ContributionVisibility>([
  'personal',
  'guild',
  'canonical',
]);

// ---------------------------------------------------------------------------
// validateContribution
// ---------------------------------------------------------------------------

/**
 * Validates inputs for a new guild contribution.
 *
 * Rules:
 * - body must be non-empty (non-whitespace)
 * - contributionType must be in the seed list (TODO #513)
 * - visibility must be personal|guild|canonical
 * - refEntityKind and refEntityId must both be present or both absent
 */
export function validateContribution(input: {
  contributionType: string;
  body: string;
  refEntityKind?: string | null;
  refEntityId?: string | null;
  visibility: string;
}): ValidateContributionResult {
  const issues: ContributionIssue[] = [];

  // body non-empty (REQ-CK-NOTE-06)
  if (!input.body || input.body.trim().length === 0) {
    issues.push({ code: 'CONTRIBUTION_BODY_REQUIRED' });
  }

  // contributionType in seed list (REQ-CK-NOTE-06)
  if (!CONTRIBUTION_TYPE_SEED.has(input.contributionType)) {
    issues.push({
      code: 'CONTRIBUTION_TYPE_INVALID',
      got: input.contributionType,
      expected: [...CONTRIBUTION_TYPE_SEED].join(','),
    });
  }

  // visibility closed enum (REQ-CK-NOTE-06)
  if (!VALID_VISIBILITY.has(input.visibility)) {
    issues.push({
      code: 'CONTRIBUTION_VISIBILITY_INVALID',
      got: input.visibility,
      expected: 'personal,guild,canonical',
    });
  }

  // refEntityKind and refEntityId must both be present or both absent
  const hasKind = Boolean(input.refEntityKind);
  const hasId = Boolean(input.refEntityId);
  if (hasKind !== hasId) {
    issues.push({
      code: 'CONTRIBUTION_REF_PARTIAL',
      message: 'refEntityKind and refEntityId must both be set or both absent',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// canSeal
// ---------------------------------------------------------------------------

/**
 * Returns true if the given viewer role may seal a contribution.
 * Only world-GMs may seal (any world-GM, last-write-wins — FORK 4 / R2).
 * REQ-CK-NOTE-07.
 */
export function canSeal(viewerRole: 'gm' | 'player'): boolean {
  return viewerRole === 'gm';
}

// ---------------------------------------------------------------------------
// applySeal
// ---------------------------------------------------------------------------

/**
 * Returns a NEW ContributionView with updated seal fields.
 * Does NOT mutate the input object (pure functional).
 * REQ-CK-NOTE-07.
 */
export function applySeal(
  contribution: ContributionView,
  status: 'confirmed' | 'debunked',
  by: string,
  at: Date,
): ContributionView {
  return {
    ...contribution,
    sealedStatus: status,
    sealedBy: by,
    sealedAt: at,
  };
}

// ---------------------------------------------------------------------------
// isVisibleTo
// ---------------------------------------------------------------------------

/**
 * Determines if a contribution is visible to the given viewer.
 *
 * Rules (REQ-CK-NOTE-08, FORK 4 #1944):
 * - gm: always true (DM sees everything, consistent with seesEntry gate)
 * - personal: only the authorUserId (or gm, above)
 * - guild: any world member
 * - canonical: any world member
 *
 * Composes WITH seesEntry (does not replace it).
 */
export function isVisibleTo(
  contribution: Pick<ContributionView, 'visibility' | 'authorUserId' | 'sealedStatus'>,
  viewer: { userId: string; role: 'gm' | 'player' },
): boolean {
  // GM sees everything
  if (viewer.role === 'gm') return true;

  switch (contribution.visibility) {
    case 'personal':
      return viewer.userId === contribution.authorUserId;
    case 'guild':
      return true; // any world member
    case 'canonical':
      return true; // any world member
    default:
      return false;
  }
}
