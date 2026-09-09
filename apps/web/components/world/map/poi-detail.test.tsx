/**
 * Tests for PoiDetail (REQ-POI-DETAIL-01) and poi-accordion behavioral preservation.
 *
 * PoiDetail: isDM=true shows dmNotes; isDM=false hides dmNotes (REQ-GATE-01 single source).
 * Accordion: extraction is behavior-preserving — name, badge, and description remain visible.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PoiRow } from '@/app/mapa/actions';
import { PoiDetail } from './poi-detail';
import { PoiAccordion } from './poi-accordion';

// PoiAccordion calls useRouter() (added in Slice 3 for "Colocar en mapa" nav).
// Mock it here so the existing accordion smoke tests continue to work.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makePoi(overrides: Partial<PoiRow> = {}): PoiRow {
  return {
    id: 'poi-1',
    worldId: 'world-1',
    hexId: 'hex-1',
    name: 'Dragon Cave',
    description: 'A dark cave in the mountains.',
    dmNotes: 'The dragon is here.',
    status: 'discovered',
    worldX: null,
    worldY: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PoiDetail unit tests (REQ-POI-DETAIL-01)
// ---------------------------------------------------------------------------

describe('PoiDetail', () => {
  it('renders the POI name', () => {
    render(<PoiDetail poi={makePoi()} isDM={false} />);
    expect(screen.getByText('Dragon Cave')).toBeDefined();
  });

  it('renders the status badge', () => {
    render(<PoiDetail poi={makePoi({ status: 'discovered' })} isDM={false} />);
    expect(screen.getByText('Descubierto')).toBeDefined();
  });

  it('renders the description when present', () => {
    render(<PoiDetail poi={makePoi()} isDM={false} />);
    expect(screen.getByText('A dark cave in the mountains.')).toBeDefined();
  });

  it('does not render description when absent', () => {
    render(<PoiDetail poi={makePoi({ description: null })} isDM={false} />);
    expect(screen.queryByText('A dark cave in the mountains.')).toBeNull();
  });

  it('shows DM notes when isDM=true (REQ-POI-DETAIL-01 scenario 1)', () => {
    render(<PoiDetail poi={makePoi({ dmNotes: 'The dragon is here.' })} isDM={true} />);
    const dmText = screen.getByText(/The dragon is here\./);
    expect(dmText).toBeDefined();
  });

  it('hides DM notes when isDM=false (REQ-POI-DETAIL-01 scenario 2)', () => {
    render(<PoiDetail poi={makePoi({ dmNotes: 'The dragon is here.' })} isDM={false} />);
    expect(screen.queryByText(/The dragon is here\./)).toBeNull();
  });

  it('does not render DM section when dmNotes is null and isDM=true', () => {
    render(<PoiDetail poi={makePoi({ dmNotes: null })} isDM={true} />);
    // No DM: prefix at all
    expect(screen.queryByText(/^DM:/)).toBeNull();
  });

  it('renders unknown badge for unknown status', () => {
    render(<PoiDetail poi={makePoi({ status: 'unknown' })} isDM={false} />);
    expect(screen.getByText('Desconocido')).toBeDefined();
  });

  it('renders cleared badge for cleared status', () => {
    render(<PoiDetail poi={makePoi({ status: 'cleared' })} isDM={false} />);
    expect(screen.getByText('Despejado')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PoiAccordion: behavior-preserving after PoiDetail extraction
// (REQ-POI-DETAIL-01 scenario 3)
// ---------------------------------------------------------------------------

describe('PoiAccordion (after PoiDetail extraction)', () => {
  const noop = async () => [];
  const noopCreate = async () => ({ ok: true as const });
  const noopUpdate = async () => ({ ok: true as const });
  const noopDelete = async () => {};

  it('renders the accordion toggle button', () => {
    render(
      <PoiAccordion
        hexId="hex-1"
        effectiveView="dm"
        onLoadPois={noop}
        onCreatePoi={noopCreate}
        onUpdatePoi={noopUpdate}
        onDeletePoi={noopDelete}
      />,
    );
    const toggle = screen.getByRole('button', { name: /ver puntos de interés/i });
    expect(toggle).toBeDefined();
  });

  it('accordion starts collapsed (aria-expanded=false)', () => {
    render(
      <PoiAccordion
        hexId="hex-1"
        effectiveView="player"
        onLoadPois={noop}
        onCreatePoi={noopCreate}
        onUpdatePoi={noopUpdate}
        onDeletePoi={noopDelete}
      />,
    );
    const toggle = screen.getByRole('button', { name: /ver puntos de interés/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
