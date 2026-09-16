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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// Mock the Server Action — sealContribution is the only value FeedCard pulls
// from this module at runtime (FeedItem/FeedSource are type-only imports,
// erased at compile time, so they need no mock counterpart here).
vi.mock('@/app/bitacora/actions', () => ({
  sealContribution: vi.fn(),
}));

// Mock next/link — render as plain anchor (same convention as
// view-only-section-sheet.test.tsx).
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
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

const factionFeedItem: FeedItem = {
  ...baseFeedItem,
  refEntityKind: 'faction',
  refEntityId: 'uuid-los-cuervos',
  refEntitySource: 'world',
  refEntityName: 'Los Cuervos',
};

const locationFeedItem: FeedItem = {
  ...baseFeedItem,
  refEntityKind: 'location',
  refEntityId: 'uuid-poi-taberna',
  refEntitySource: 'world',
  refEntityName: 'La Taberna del Ancla',
};

const unknownKindFeedItem: FeedItem = {
  ...baseFeedItem,
  refEntityKind: 'quest',
  refEntityId: 'uuid-quest-01',
  refEntitySource: 'world',
  refEntityName: 'Encontrar el amuleto',
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
// Tap-to-open (feed-entity-tap-to-open, MVP #3.10) — role-gated destinations.
// ---------------------------------------------------------------------------

describe('FeedCard — tap-to-open destinations', () => {
  it('bestiary ref renders a link to /compendium/monsters with slug + source (any viewer)', () => {
    render(<FeedCard item={bestiaryFeedItem} effectiveView="player" />);

    const link = screen.getByRole('link', { name: 'Ver Bestiario: Goblin' });
    expect(link.getAttribute('href')).toBe('/compendium/monsters?slug=goblin&source=MM&q=Goblin');
  });

  it('the bestiary link narrows the destination fetch by name', () => {
    // The destination seeds its selection from an SSR fetch of limit=50 over a
    // 2896-row bestiary (Goblin sits at #1175 alphabetically). Without ?q= the
    // slug is simply not in the rows the seeding searches, so the link would open
    // the list and nothing else for all but the first ~50 monsters.
    render(<FeedCard item={bestiaryFeedItem} effectiveView="player" />);

    const href = screen.getByRole('link', { name: 'Ver Bestiario: Goblin' }).getAttribute('href');
    expect(new URLSearchParams(href!.split('?')[1]).get('q')).toBe('Goblin');
  });

  it('location ref renders a link to /mapa?poi=<id> (any viewer)', () => {
    render(<FeedCard item={locationFeedItem} effectiveView="player" />);

    const link = screen.getByRole('link', { name: 'Ver Lugar: La Taberna del Ancla' });
    expect(link.getAttribute('href')).toBe('/mapa?poi=uuid-poi-taberna');
  });

  it('npc ref with effectiveView="player" renders NO link (DM-only destination, ADR-6)', () => {
    render(<FeedCard item={npcFeedItem} effectiveView="player" />);

    expect(screen.queryByRole('link')).toBeNull();
    // The card itself is still shown — just inert, exactly like today.
    expect(screen.getByText('Aldeana Marta')).toBeTruthy();
  });

  it('npc ref with effectiveView="dm" renders a link to /herramientas/npcs?npc=<id>', () => {
    render(<FeedCard item={npcFeedItem} effectiveView="dm" />);

    const link = screen.getByRole('link', { name: 'Ver NPC: Aldeana Marta' });
    expect(link.getAttribute('href')).toBe('/herramientas/npcs?npc=uuid-aldeana-marta');
  });

  it('faction ref with effectiveView="player" renders NO link (DM-only destination, ADR-6)', () => {
    render(<FeedCard item={factionFeedItem} effectiveView="player" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Los Cuervos')).toBeTruthy();
  });

  it('faction ref with effectiveView="dm" renders a link to /herramientas/facciones?faccion=<id>', () => {
    render(<FeedCard item={factionFeedItem} effectiveView="dm" />);

    const link = screen.getByRole('link', { name: 'Ver Facción: Los Cuervos' });
    expect(link.getAttribute('href')).toBe('/herramientas/facciones?faccion=uuid-los-cuervos');
  });

  it('a ref with refEntityName: null renders no card at all (no regression)', () => {
    render(<FeedCard item={noRefFeedItem} effectiveView="dm" />);

    expect(document.querySelector('[data-testid="entity-card"]')).toBeNull();
  });

  it('unknown kind renders inert — card shown, no link', () => {
    render(<FeedCard item={unknownKindFeedItem} effectiveView="dm" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Encontrar el amuleto')).toBeTruthy();
    const entityCard = document.querySelector('[data-testid="entity-card"]');
    expect(entityCard?.tagName).toBe('DIV');
  });

  it('the link is keyboard-focusable and carries a visible focus ring class', () => {
    render(<FeedCard item={bestiaryFeedItem} effectiveView="dm" />);

    const link = screen.getByRole('link', { name: 'Ver Bestiario: Goblin' });
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.className).toContain('focus-visible:ring-2');
  });

  it('the inert card keeps min-h-[44px] identical to the non-interactive branch', () => {
    render(<FeedCard item={npcFeedItem} effectiveView="player" />);

    const entityCard = document.querySelector('[data-testid="entity-card"]');
    expect(entityCard).not.toBeNull();
    expect(entityCard?.className).toContain('min-h-[44px]');
    expect(entityCard?.tagName).toBe('DIV');
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

// ---------------------------------------------------------------------------
// Touch affordance (CLAUDE.md §2 — mobile-first, no hover-dependent flows)
// ---------------------------------------------------------------------------

describe('FeedCard entity card — touch affordance', () => {
  it('a tappable entity card carries a visible marker a phone can see', () => {
    // The card signals tappability with hover:bg-paper, which does not exist on
    // touch. Without a hover-independent marker the linked card is pixel-identical
    // to the inert one, so a player has no way to know it opens anything.
    render(<FeedCard item={bestiaryFeedItem} effectiveView="player" />);

    const entityCard = document.querySelector('[data-testid="entity-card"]');
    expect(entityCard).not.toBeNull();
    expect(entityCard!.tagName).toBe('A');
    expect(entityCard!.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('the inert entity card carries no affordance — it promises nothing', () => {
    // npc + player has no destination (/herramientas/npcs calls notFound() for
    // players), so the card must stay inert AND look inert.
    render(<FeedCard item={npcFeedItem} effectiveView="player" />);

    const entityCard = document.querySelector('[data-testid="entity-card"]');
    expect(entityCard).not.toBeNull();
    expect(entityCard!.tagName).not.toBe('A');
    expect(entityCard!.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('the affordance stays out of the accessible name', () => {
    render(<FeedCard item={bestiaryFeedItem} effectiveView="player" />);

    // aria-label wins over content, and the marker is aria-hidden on top of that:
    // a screen reader announces the entity, never a stray chevron.
    const link = screen.getByLabelText('Ver Bestiario: Goblin');
    expect(link.getAttribute('data-testid')).toBe('entity-card');
  });
});
