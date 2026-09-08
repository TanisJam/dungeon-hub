/**
 * Unit tests for FeedCard entity card rendering.
 *
 * RED-first per STRICT TDD.
 *
 * Tests the linked-entity card block added to feed-card.tsx:
 * W-2: renders entity card when refEntityName='Aldeana Marta' + refEntityKind='npc'
 *      — asserts card visible, name text present, kind label "NPC" present.
 * W-3: entity card has min-h-[44px] class (mobile accessibility ≥44px tap target).
 * W-4: NO entity card rendered when refEntityName=null.
 * W-5: kind 'bestiary' renders label "Bestiario".
 *
 * guild-feed-linked-entity-refs SDD spec REQ-GFLE-06, design ADR-5.
 * Mobile-first 375px (iPhone SE).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the Server Action — sealContribution is the only value FeedCard pulls
// from this module at runtime (FeedItem/FeedSource are type-only imports,
// erased at compile time, so they need no mock counterpart here).
vi.mock('@/app/bitacora/actions', () => ({
  sealContribution: vi.fn(),
}));

import { FeedCard } from './feed-card';
import { sealContribution } from '@/app/bitacora/actions';
import type { FeedItem } from '@/app/bitacora/actions';

const mockedSealContribution = vi.mocked(sealContribution);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseFeedItem: FeedItem = {
  id: 'test-feed-item-001',
  source: 'gremio',
  title: 'Encuentro en la taberna',
  body: 'Conocimos a una aldeana llamada Marta.',
  tags: ['npc'],
  sortAt: '2026-06-08T12:00:00.000Z',
  visibility: 'guild',
};

const npcFeedItem: FeedItem = {
  ...baseFeedItem,
  refEntityKind: 'npc',
  refEntityId: 'uuid-aldeana-marta',
  refEntitySource: 'world',
  refEntityName: 'Aldeana Marta',
};

const bestiaryFeedItem: FeedItem = {
  ...baseFeedItem,
  refEntityKind: 'bestiary',
  refEntityId: 'goblin',
  refEntitySource: 'MM',
  refEntityName: 'Goblin',
};

const noRefFeedItem: FeedItem = {
  ...baseFeedItem,
  refEntityKind: null,
  refEntityId: null,
  refEntityName: null,
};

// ---------------------------------------------------------------------------
// W-2: entity card renders when refEntityName present
// ---------------------------------------------------------------------------

describe('FeedCard — linked-entity card', () => {
  it('(W-2) renders entity card with name and NPC kind label when refEntityName is set', () => {
    // REQ-GFLE-06: renders entity card with name + kind label.
    // ADR-5: non-interactive v1 display-only card.
    render(<FeedCard item={npcFeedItem} />);

    // Entity name visible
    expect(screen.getByText('Aldeana Marta')).toBeTruthy();

    // Kind label "NPC" visible
    expect(screen.getByText('NPC')).toBeTruthy();
  });

  // W-3: min-h-[44px] class present
  it('(W-3) entity card element has min-h-[44px] class for mobile tap target', () => {
    // REQ-GFLE-06: ≥44px tap target (iOS HIG, mobile-first).
    render(<FeedCard item={npcFeedItem} />);

    // Find the entity card container — it carries the data-testid="entity-card"
    // OR we can find by role/text and check the containing element's className.
    // The entity card should have min-h-[44px] in its className.
    const entityCard = document.querySelector('[data-testid="entity-card"]');
    expect(entityCard).not.toBeNull();
    expect(entityCard?.className).toContain('min-h-[44px]');
  });

  // W-4: no entity card when refEntityName is null
  it('(W-4) NO entity card rendered when refEntityName is null', () => {
    // REQ-GFLE-06: absent when no ref (or unresolvable ref).
    render(<FeedCard item={noRefFeedItem} />);

    const entityCard = document.querySelector('[data-testid="entity-card"]');
    expect(entityCard).toBeNull();
  });

  // W-5: bestiary kind renders "Bestiario" label
  it('(W-5) kind "bestiary" renders label "Bestiario"', () => {
    // REQ-GFLE-06: kind→label map: bestiary→Bestiario.
    // ADR-5: kind label displayed.
    render(<FeedCard item={bestiaryFeedItem} />);

    expect(screen.getByText('Bestiario')).toBeTruthy();
    expect(screen.getByText('Goblin')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Seal controls (bitacora-gremio-sealing #3.10) — DM-only Confirmar/Refutar.
// ---------------------------------------------------------------------------

const unsealedFeedItem: FeedItem = {
  ...baseFeedItem,
  id: 'contrib-001',
  sealedStatus: null,
};

describe('FeedCard — seal controls', () => {
  beforeEach(() => {
    mockedSealContribution.mockReset();
  });

  it('hides seal controls for a player (effectiveView omitted defaults to player)', () => {
    render(<FeedCard item={unsealedFeedItem} />);

    expect(screen.queryByText('Confirmar')).toBeNull();
    expect(screen.queryByText('Refutar')).toBeNull();
  });

  it('hides seal controls when effectiveView="player" explicitly', () => {
    render(<FeedCard item={unsealedFeedItem} effectiveView="player" />);

    expect(screen.queryByText('Confirmar')).toBeNull();
    expect(screen.queryByText('Refutar')).toBeNull();
  });

  it('shows seal controls for a DM (effectiveView="dm")', () => {
    render(<FeedCard item={unsealedFeedItem} effectiveView="dm" />);

    expect(screen.getByText('Confirmar')).toBeTruthy();
    expect(screen.getByText('Refutar')).toBeTruthy();
  });

  it('a successful seal updates the displayed status pill', async () => {
    mockedSealContribution.mockResolvedValue({
      ok: true,
      data: { id: 'contrib-001', sealedStatus: 'confirmed', sealedBy: 'dm-user', sealedAt: '2026-06-08T12:00:00.000Z' },
    });

    render(<FeedCard item={unsealedFeedItem} effectiveView="dm" />);

    expect(screen.queryByText('Confirmado')).toBeNull();

    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => {
      expect(screen.getByText('Confirmado')).toBeTruthy();
    });
    expect(mockedSealContribution).toHaveBeenCalledWith('contrib-001', 'confirmed');
  });

  it('a 403 response surfaces its message instead of failing silently', async () => {
    mockedSealContribution.mockResolvedValue({
      ok: false,
      error: 'No tenés permisos de DM para sellar este aporte.',
      status: 403,
    });

    render(<FeedCard item={unsealedFeedItem} effectiveView="dm" />);

    fireEvent.click(screen.getByText('Confirmar'));

    await waitFor(() => {
      expect(
        screen.getByText('No tenés permisos de DM para sellar este aporte.'),
      ).toBeTruthy();
    });
    // No optimistic update on failure — status pill must not appear.
    expect(screen.queryByText('Confirmado')).toBeNull();
  });
});
