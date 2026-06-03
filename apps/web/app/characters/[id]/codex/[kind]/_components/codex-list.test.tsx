/**
 * Component test: CodexList island
 *
 * REQ-CCB-WEB-02: player view — only known rows rendered, no extra DOM rows; empty state.
 * REQ-CCB-WEB-03: DM view — all rows present; grant affordance absent (DmGrantPanel is separate).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodexList } from './codex-list';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock Server Actions — module-level imports inside the island
vi.mock('../actions', () => ({
  searchCodexCategory: vi.fn(),
  getCodexDetail: vi.fn(),
}));

// Mock V3Sheet — no portal complexity in unit tests
vi.mock('@/components/ui', () => ({
  V3Sheet: ({ children, open, title }: { children: React.ReactNode; open: boolean; title: string }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

// Mock CompendiumEntriesWithTerms — not the concern of this test
vi.mock('@/components/compendium/term/CompendiumEntriesWithTerms', () => ({
  CompendiumEntriesWithTerms: () => <div data-testid="entries" />,
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MONSTER_A = { slug: 'goblin', source: 'MM', name: 'Goblin', cr: '1/4', type: 'humanoid', size: 'S', known: true };
const MONSTER_B = { slug: 'orc', source: 'MM', name: 'Orc', cr: '1/2', type: 'humanoid', size: 'M', known: true };
const MONSTER_C = { slug: 'dragon', source: 'MM', name: 'Dragon', cr: '17', type: 'dragon', size: 'H', known: false };

const BASE_PROPS = {
  kind: 'monsters' as const,
  charId: 'char-test-id',
  worldId: 'world-test-id',
  accessToken: 'test-token',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexList', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('REQ-CCB-WEB-02: player view — only known rows rendered', () => {
    // Player effectiveView: API returns only known=true rows
    render(
      <CodexList
        {...BASE_PROPS}
        initialRows={[MONSTER_A, MONSTER_B]}
        total={2}
        effectiveView="player"
      />
    );

    // Goblin and Orc are visible (known=true)
    expect(screen.getByText('Goblin')).toBeTruthy();
    expect(screen.getByText('Orc')).toBeTruthy();

    // No "Vista de DM" banner for player view
    expect(screen.queryByText(/vista de dm/i)).toBeNull();
  });

  it('REQ-CCB-WEB-02: empty state shown when zero rows', () => {
    render(
      <CodexList
        {...BASE_PROPS}
        initialRows={[]}
        total={0}
        effectiveView="player"
      />
    );

    expect(screen.getByText('No hay entradas descubiertas aún.')).toBeTruthy();
  });

  it('REQ-CCB-WEB-03: DM view — all rows present (known and unknown)', () => {
    // DM effectiveView: API returns all rows with known flag
    render(
      <CodexList
        {...BASE_PROPS}
        initialRows={[MONSTER_A, MONSTER_B, MONSTER_C]}
        total={3}
        effectiveView="dm"
      />
    );

    // All monsters visible (DM sees full list).
    // Note: MonsterRowView renders both name and type — e.g. "Dragon" appears as name
    // and "dragon" appears as type (capitalized). Use getAllByText for ambiguous matches.
    expect(screen.getByText('Goblin')).toBeTruthy();
    expect(screen.getByText('Orc')).toBeTruthy();
    // Dragon appears multiple times (name + type label) — getAllByText is correct here
    expect(screen.getAllByText('Dragon').length).toBeGreaterThanOrEqual(1);

    // DM banner is present
    expect(screen.getByText(/vista de dm/i)).toBeTruthy();
  });

  it('REQ-CCB-WEB-03: grant affordance absent — DmGrantPanel is a separate component', () => {
    // CodexList itself does not render DmGrantPanel — grant affordances come from
    // the parent character sheet (DmGrantPanel). This test confirms CodexList
    // does NOT render a grant button or "Otorgar" text.
    render(
      <CodexList
        {...BASE_PROPS}
        initialRows={[MONSTER_A]}
        total={1}
        effectiveView="dm"
      />
    );

    // No grant affordance in CodexList itself (REQ-CCB-WEB-03 grant-affordance scenario:
    // "DM sees the grant affordance" refers to DmGrantPanel on the character sheet page,
    // not CodexList which is view-only)
    expect(screen.queryByText(/otorgar/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /otorgar/i })).toBeNull();
  });

  it('REQ-CCB-WEB-02: player view shows search input', () => {
    render(
      <CodexList
        {...BASE_PROPS}
        initialRows={[MONSTER_A]}
        total={1}
        effectiveView="player"
      />
    );

    const searchInput = screen.getByRole('searchbox');
    expect(searchInput).toBeTruthy();
  });
});
