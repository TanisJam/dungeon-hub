// Tests for DetailSheet generic component. ADR-4, REQ-CBROWSE-06.
// Verifies: loading state, V3Sheet open, CompendiumEntriesWithTerms called with entries.

import type React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/app/compendium/[category]/actions', () => ({
  getCompendiumDetail: vi.fn(),
  searchCompendium: vi.fn(),
}));

vi.mock('@/components/compendium/term/CompendiumEntriesWithTerms', () => ({
  CompendiumEntriesWithTerms: vi.fn(({ entries }: { entries: unknown[] }) => (
    <div data-testid="entries-renderer" data-entries-count={entries?.length ?? 0} />
  )),
}));

// Mock V3Sheet — renders children when open (avoids portal/jsdom issues)
vi.mock('@/components/ui', () => ({
  V3Sheet: vi.fn(({ open, children, title }: { open: boolean; children: React.ReactNode; title?: string }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null
  ),
  Icon: vi.fn(() => null),
  Pill: vi.fn(() => null),
}));

import { DetailSheet } from '../_components/detail-sheet';
import { getCompendiumDetail } from '@/app/compendium/[category]/actions';

const CAMPAIGN_SCOPE = { campaign: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' } as const;

const SPELL_ROW = {
  slug: 'fireball',
  source: 'PHB',
  name: 'Fireball',
  level: 3,
  school: 'E',
};

const SPELL_DETAIL = {
  ...SPELL_ROW,
  data: {
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 150 } },
    components: { v: true, s: true, m: 'a tiny ball of bat guano and sulfur' },
    duration: [{ type: 'instant' }],
    entries: ['First entry', 'Second entry'],
  },
};

// Race with lore — packages/compendium-import/src/fluff.ts attaches data.fluff
// to races, backgrounds and classes as the same entry-node shape as data.entries.
const DWARF_ROW = {
  slug: 'dwarf',
  source: 'PHB',
  name: 'Dwarf',
};

const DWARF_DETAIL_WITH_FLUFF = {
  ...DWARF_ROW,
  data: {
    size: ['M'],
    speed: 25,
    entries: ['Mechanical entry'],
    fluff: ['Dwarves are a stout and hardy people.'],
  },
};

const MockHeader = vi.fn(({ data }: { data: unknown }) => (
  <div data-testid="mock-header" data-name={(data as typeof SPELL_DETAIL).name} />
));

const mockConfig = {
  endpoint: 'spells',
  label: 'Hechizos',
  RowView: vi.fn(),
  Header: MockHeader,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DetailSheet — ADR-4, REQ-CBROWSE-06', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('shows loading state immediately on open before detail resolves', async () => {
    // Never resolves during this test
    vi.mocked(getCompendiumDetail).mockImplementation(
      () => new Promise(() => {/* intentionally pending */}),
    );

    render(
      <DetailSheet
        open={true}
        category="spells"
        row={SPELL_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Cargando…')).toBeTruthy();
  });

  it('renders V3Sheet open and config.Header after detail resolves', async () => {
    vi.mocked(getCompendiumDetail).mockResolvedValue(SPELL_DETAIL);

    render(
      <DetailSheet
        open={true}
        category="spells"
        row={SPELL_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-header')).toBeTruthy();
    });

    // V3Sheet is open (mocked as role=dialog)
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('calls CompendiumEntriesWithTerms with entries from detail.data.entries', async () => {
    vi.mocked(getCompendiumDetail).mockResolvedValue(SPELL_DETAIL);

    render(
      <DetailSheet
        open={true}
        category="spells"
        row={SPELL_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      const renderer = screen.getByTestId('entries-renderer');
      expect(Number(renderer.dataset.entriesCount)).toBe(SPELL_DETAIL.data.entries.length);
    });
  });

  it('shows error state when getCompendiumDetail returns null', async () => {
    vi.mocked(getCompendiumDetail).mockResolvedValue(null);

    render(
      <DetailSheet
        open={true}
        category="spells"
        row={SPELL_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No se pudo cargar el detalle.')).toBeTruthy();
    });
  });

  it('does NOT render when open is false', () => {
    vi.mocked(getCompendiumDetail).mockResolvedValue(SPELL_DETAIL);

    render(
      <DetailSheet
        open={false}
        category="spells"
        row={SPELL_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders a lore section under "Descripción" when data.fluff has content', async () => {
    vi.mocked(getCompendiumDetail).mockResolvedValue(DWARF_DETAIL_WITH_FLUFF);

    render(
      <DetailSheet
        open={true}
        category="races"
        row={DWARF_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Descripción')).toBeTruthy();
    });

    // Both the mechanical entries and the lore are rendered via the same
    // CompendiumEntriesWithTerms renderer — never a second, parallel one.
    const renderers = screen.getAllByTestId('entries-renderer');
    expect(renderers).toHaveLength(2);
    const fluffRenderer = renderers.find(
      (el) => Number(el.dataset.entriesCount) === DWARF_DETAIL_WITH_FLUFF.data.fluff.length,
    );
    expect(fluffRenderer).toBeTruthy();
  });

  it('renders no "Descripción" heading when data.fluff is absent', async () => {
    vi.mocked(getCompendiumDetail).mockResolvedValue(SPELL_DETAIL);

    render(
      <DetailSheet
        open={true}
        category="spells"
        row={SPELL_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-header')).toBeTruthy();
    });

    expect(screen.queryByText('Descripción')).toBeNull();
  });

  it('renders no "Descripción" heading when data.fluff is an empty array', async () => {
    vi.mocked(getCompendiumDetail).mockResolvedValue({
      ...DWARF_DETAIL_WITH_FLUFF,
      data: { ...DWARF_DETAIL_WITH_FLUFF.data, fluff: [] },
    });

    render(
      <DetailSheet
        open={true}
        category="races"
        row={DWARF_ROW}
        scope={CAMPAIGN_SCOPE}
        worldId="world-id"
        accessToken="token"
        config={mockConfig}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-header')).toBeTruthy();
    });

    expect(screen.queryByText('Descripción')).toBeNull();
    expect(screen.getAllByTestId('entries-renderer')).toHaveLength(1);
  });
});
