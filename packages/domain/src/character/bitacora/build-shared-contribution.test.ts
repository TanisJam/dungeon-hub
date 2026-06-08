/**
 * Unit tests for buildSharedContribution pure mapper.
 *
 * RED commit — written FIRST before implementation.
 *
 * No PHB rule (UX/data-model feature). Anti-metagaming snapshot mapper:
 * takes a BitacoraPageSnapshot (page data) and returns the insert payload
 * for a guild_contributions row.
 *
 * bitacora-personal-share SDD spec #2035 REQ-SHARE-01/REQ-SHARE-08 ADR-4.
 */

import { describe, it, expect } from 'vitest';
import { buildSharedContribution } from './build-shared-contribution.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const basePage = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  title: 'El Dragón Rojo',
  body: 'Lo vimos al norte.',
  tags: ['monsters', 'locations'],
  worldId: 'world-uuid-001',
  authorUserId: 'user-uuid-001',
};

const untitledPage = {
  id: '550e8400-e29b-41d4-a716-446655440002',
  title: null,
  body: 'Notas sin título.',
  tags: ['lore'],
  worldId: 'world-uuid-002',
  authorUserId: 'user-uuid-002',
};

// ---------------------------------------------------------------------------
// Case (a): titled page carries title
// ---------------------------------------------------------------------------

describe('buildSharedContribution — titled page', () => {
  it('(a) title is carried from the page into the payload', () => {
    // REQ-SHARE-01: snapshot carries title.
    // ADR-4: pure mapper, no IO.
    const payload = buildSharedContribution(basePage);
    expect(payload.title).toBe('El Dragón Rojo');
  });
});

// ---------------------------------------------------------------------------
// Case (b): untitled page → title null
// ---------------------------------------------------------------------------

describe('buildSharedContribution — untitled page', () => {
  it('(b) untitled page → title null (not empty string, not error)', () => {
    // REQ-SHARE-01 (untitled scenario): title=NULL when page has no title.
    const payload = buildSharedContribution(untitledPage);
    expect(payload.title).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case (c): tags copied verbatim
// ---------------------------------------------------------------------------

describe('buildSharedContribution — tags', () => {
  it('(c) tags are copied verbatim from page', () => {
    // REQ-SHARE-08: tags verbatim copy; already ⊆ KNOWLEDGE_TAGS on source page.
    const payload = buildSharedContribution(basePage);
    expect(payload.tags).toEqual(['monsters', 'locations']);
  });

  it('(c2) empty tags stay empty', () => {
    const page = { ...basePage, tags: [] };
    const payload = buildSharedContribution(page);
    expect(payload.tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Case (d): contributionType = 'nota'
// ---------------------------------------------------------------------------

describe('buildSharedContribution — contributionType', () => {
  it("(d) contributionType is 'nota'", () => {
    // ADR-4: 'nota' ∈ CONTRIBUTION_TYPE_SEED (validate.ts:56).
    const payload = buildSharedContribution(basePage);
    expect(payload.contributionType).toBe('nota');
  });
});

// ---------------------------------------------------------------------------
// Case (e): visibility = 'guild'
// ---------------------------------------------------------------------------

describe('buildSharedContribution — visibility', () => {
  it("(e) visibility is 'guild'", () => {
    // REQ-SHARE-06: visibility='guild' → isVisibleTo returns true for all world members.
    const payload = buildSharedContribution(basePage);
    expect(payload.visibility).toBe('guild');
  });
});

// ---------------------------------------------------------------------------
// Case (f): body snapshotted
// ---------------------------------------------------------------------------

describe('buildSharedContribution — body', () => {
  it('(f) body is a snapshot of the page body', () => {
    // REQ-SHARE-01: body = P.body at share time.
    const payload = buildSharedContribution(basePage);
    expect(payload.body).toBe('Lo vimos al norte.');
  });
});

// ---------------------------------------------------------------------------
// Case (g): sourceBitacoraPageId = page.id
// ---------------------------------------------------------------------------

describe('buildSharedContribution — sourceBitacoraPageId', () => {
  it('(g) sourceBitacoraPageId equals the page id', () => {
    // ADR-1: back-link FK → bitacora_pages(id).
    const payload = buildSharedContribution(basePage);
    expect(payload.sourceBitacoraPageId).toBe('550e8400-e29b-41d4-a716-446655440001');
  });
});

// ---------------------------------------------------------------------------
// Case (h): refEntityKind = null, refEntityId = null (structured refs NOT copied v1)
// ---------------------------------------------------------------------------

describe('buildSharedContribution — ref fields null', () => {
  it('(h) refEntityKind is null (structured refs not copied v1 — deferred to UUID bridge #1946)', () => {
    // REQ-SHARE-08: refs array NOT copied; refEntityKind/refEntityId remain null.
    const payload = buildSharedContribution(basePage);
    expect(payload.refEntityKind).toBeNull();
  });

  it('(h2) refEntityId is null', () => {
    const payload = buildSharedContribution(basePage);
    expect(payload.refEntityId).toBeNull();
  });
});
