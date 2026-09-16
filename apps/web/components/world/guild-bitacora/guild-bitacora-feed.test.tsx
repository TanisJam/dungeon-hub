/**
 * Unit tests for GuildBitacoraFeed cursor-pagination client wiring.
 *
 * RED-first per STRICT TDD.
 *
 * feat/feed-cursor-client: the API now returns an opaque `nextCursor`
 * alongside the legacy `nextOffset`. The client must round-trip the cursor
 * verbatim (never parse/construct it), append (never replace) on load-more,
 * reset to the first page (no cursor) on tag change, hide "Cargar más" once
 * `nextCursor` is null, and use the SSR-provided initial cursor for the
 * first load-more call.
 *
 * Covers:
 *   T1 — load-more sends the exact cursor the previous response returned.
 *   T2 — appended rows are added, not substituted.
 *   T3 — a tag change sends NO cursor.
 *   T4 — nextCursor: null hides the load-more control.
 *   T5 — the initial SSR cursor is used for the first load-more.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the Server Actions module — GuildBitacoraFeed only pulls
// listGuildBitacoraFeed at runtime (FeedItem/FeedSource are type-only
// imports, erased at compile time). FeedCard (rendered per item) also pulls
// sealContribution, so it needs a mock counterpart even though these tests
// never trigger it.
vi.mock('@/app/bitacora/actions', () => ({
  listGuildBitacoraFeed: vi.fn(),
  sealContribution: vi.fn(),
}));

// GuildBitacoraFeed statically imports ContributionComposer, which pulls in
// createContribution from '@/app/herramientas/actions' — a Server Action
// module that reads Supabase env vars at import time. The composer sheet is
// never opened in these tests (composerOpen defaults to false), so a bare
// mock is enough to keep the import graph from hitting `lib/env.ts`.
vi.mock('@/app/herramientas/actions', () => ({
  createContribution: vi.fn(),
}));

import { GuildBitacoraFeed } from './guild-bitacora-feed';
import { listGuildBitacoraFeed } from '@/app/bitacora/actions';
import type { FeedItem, GuildBitacoraFeedResult } from '@/app/bitacora/actions';

const mockedListGuildBitacoraFeed = vi.mocked(listGuildBitacoraFeed);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(id: string): FeedItem {
  return {
    id,
    source: 'gremio',
    title: `Entrada ${id}`,
    body: 'Cuerpo de la entrada.',
    tags: [],
    sortAt: '2026-06-08T12:00:00.000Z',
    visibility: 'guild',
  };
}

const OPAQUE_CURSOR_1 = 'eyJvcGFxdWUiOiJ0b2tlbi0xIn0';
const OPAQUE_CURSOR_2 = 'eyJvcGFxdWUiOiJ0b2tlbi0yIn0';

beforeEach(() => {
  mockedListGuildBitacoraFeed.mockReset();
});

// ---------------------------------------------------------------------------
// T1 + T5 — load-more sends the exact SSR-provided cursor, verbatim
// ---------------------------------------------------------------------------

describe('GuildBitacoraFeed — load more cursor round-trip', () => {
  it('sends the initial SSR nextCursor, verbatim, on the first load-more', async () => {
    const page2Result: GuildBitacoraFeedResult = {
      rows: [makeItem('item-2')],
      pageCount: 1,
      nextCursor: OPAQUE_CURSOR_2,
    };
    mockedListGuildBitacoraFeed.mockResolvedValueOnce(page2Result);

    render(
      <GuildBitacoraFeed
        worldId="world-1"
        initialItems={[makeItem('item-1')]}
        initialNextCursor={OPAQUE_CURSOR_1}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => expect(mockedListGuildBitacoraFeed).toHaveBeenCalledTimes(1));

    const [, opts] = mockedListGuildBitacoraFeed.mock.calls[0];
    expect(opts.cursor).toBe(OPAQUE_CURSOR_1);
  });

  it('sends the cursor exactly as returned by the previous response, unmodified', async () => {
    const page2Result: GuildBitacoraFeedResult = {
      rows: [makeItem('item-2')],
      pageCount: 1,
      nextCursor: OPAQUE_CURSOR_2,
    };
    const page3Result: GuildBitacoraFeedResult = {
      rows: [makeItem('item-3')],
      pageCount: 1,
      nextCursor: null,
    };
    mockedListGuildBitacoraFeed.mockResolvedValueOnce(page2Result);
    mockedListGuildBitacoraFeed.mockResolvedValueOnce(page3Result);

    render(
      <GuildBitacoraFeed
        worldId="world-1"
        initialItems={[makeItem('item-1')]}
        initialNextCursor={OPAQUE_CURSOR_1}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(mockedListGuildBitacoraFeed).toHaveBeenCalledTimes(1));
    await screen.findByText('Entrada item-2');

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(mockedListGuildBitacoraFeed).toHaveBeenCalledTimes(2));

    const [, secondCallOpts] = mockedListGuildBitacoraFeed.mock.calls[1];
    // Must be exactly what page2Result returned — never parsed, never rebuilt.
    expect(secondCallOpts.cursor).toBe(OPAQUE_CURSOR_2);
  });
});

// ---------------------------------------------------------------------------
// T2 — appended rows are added, not substituted
// ---------------------------------------------------------------------------

describe('GuildBitacoraFeed — load more appends', () => {
  it('appends the new page to the existing rows instead of replacing them', async () => {
    mockedListGuildBitacoraFeed.mockResolvedValueOnce({
      rows: [makeItem('item-2')],
      pageCount: 1,
      nextCursor: null,
    });

    render(
      <GuildBitacoraFeed
        worldId="world-1"
        initialItems={[makeItem('item-1')]}
        initialNextCursor={OPAQUE_CURSOR_1}
      />,
    );

    expect(screen.queryByText('Entrada item-1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await screen.findByText('Entrada item-2');
    // Original page-1 row must still be present — appended, not substituted.
    expect(screen.queryByText('Entrada item-1')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T3 — tag change sends NO cursor
// ---------------------------------------------------------------------------

describe('GuildBitacoraFeed — tag change resets pagination', () => {
  it('sends no cursor when the tag filter changes', async () => {
    mockedListGuildBitacoraFeed.mockResolvedValueOnce({
      rows: [makeItem('item-monsters-1')],
      pageCount: 1,
      nextCursor: OPAQUE_CURSOR_2,
    });

    render(
      <GuildBitacoraFeed
        worldId="world-1"
        initialItems={[makeItem('item-1')]}
        initialNextCursor={OPAQUE_CURSOR_1}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Monstruos' }));

    await waitFor(() => expect(mockedListGuildBitacoraFeed).toHaveBeenCalledTimes(1));

    const [, opts] = mockedListGuildBitacoraFeed.mock.calls[0];
    expect(opts).not.toHaveProperty('cursor');
    expect(opts.tag).toBe('monsters');
  });
});

// ---------------------------------------------------------------------------
// T4 — nextCursor: null hides the load-more control
// ---------------------------------------------------------------------------

describe('GuildBitacoraFeed — end of feed', () => {
  it('hides "Cargar más" when initialNextCursor is null', () => {
    render(
      <GuildBitacoraFeed worldId="world-1" initialItems={[makeItem('item-1')]} initialNextCursor={null} />,
    );

    expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
  });

  it('hides "Cargar más" once a load-more response returns nextCursor: null', async () => {
    mockedListGuildBitacoraFeed.mockResolvedValueOnce({
      rows: [makeItem('item-2')],
      pageCount: 1,
      nextCursor: null,
    });

    render(
      <GuildBitacoraFeed
        worldId="world-1"
        initialItems={[makeItem('item-1')]}
        initialNextCursor={OPAQUE_CURSOR_1}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull(),
    );
  });
});
