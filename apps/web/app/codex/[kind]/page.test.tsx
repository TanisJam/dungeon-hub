/**
 * Component test: /codex/[kind] page — routing split (B-1)
 *
 * codex-knowledge B-1 (SDD tasks #1950, spec #1947, design #1948):
 *   REQ-CK-GATE-08: reference family → /compendium/{endpoint}?world= (real shape: { data, total })
 *   REQ-CK-GATE-08: world-knowledge family → /characters/:id/knowledge/:kind (real shape: { rows, total, knownCount, effectiveView })
 *   REQ-CK-GATE-09: world-knowledge with 0 known rows → non-error empty state (375px message)
 *   ADR-2 (Option A, #1946): monsters fully wired; npcs/factions/locations/lore → gated-empty
 *
 * HARD RULE #1932: fixtures match REAL API shapes confirmed from route code:
 *   - Reference path: GET /compendium/{endpoint}?world=... → { data: Row[], total, limit, offset }
 *     (characters.ts compendium route, real field name: `data`)
 *   - World-knowledge path: GET /characters/:id/knowledge/:kind → { rows: Row[], total, knownCount, effectiveView }
 *     (characters.ts:1835-1840, read-character-codex.ts:63-68)
 *
 * Design intent: FORK 2 (#1944). This arc encodes NO PHB rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
      getSession: vi.fn(() => Promise.resolve({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  })),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown, message: string) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

vi.mock('@/lib/active-character', () => ({
  getActiveCharacter: vi.fn(() => Promise.resolve({
    id: 'char-active',
    worldId: 'world-test',
    name: 'Test Hero',
    status: 'active',
  })),
}));

// dh:role view-preference (preview-as-player toggle). Defaults to null (no override).
vi.mock('@/lib/role', () => ({
  getViewPreference: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => { throw new Error('redirect'); }),
  notFound: vi.fn(() => { throw new Error('notFound'); }),
}));

vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div><h1>{title}</h1>{children}</div>
  ),
}));

// Mock CompendiumList (reference path) — simpler passthrough
vi.mock('@/app/compendium/[category]/_components/compendium-list', () => ({
  CompendiumList: ({ category, initialRows, total }: { category: string; initialRows: unknown[]; total: number }) => (
    <div data-testid="compendium-list" data-category={category} data-total={total}>
      {(initialRows as Array<{ name: string }>).map((r, i) => <span key={i}>{r.name}</span>)}
    </div>
  ),
}));

// Mock CodexList (world-knowledge path) — simpler passthrough
vi.mock('@/app/characters/[id]/codex/[kind]/_components/codex-list', () => ({
  CodexList: ({ kind, initialRows, total, effectiveView }: { kind: string; initialRows: unknown[]; total: number; effectiveView: string }) => (
    <div data-testid="codex-list" data-kind={kind} data-total={total} data-effective-view={effectiveView}>
      {(initialRows as Array<{ name: string }>).map((r, i) => <span key={i}>{r.name}</span>)}
    </div>
  ),
}));

import { api } from '@/lib/api';
import CodexKindPage from './page';

// ---------------------------------------------------------------------------
// Test data (REAL shapes from route code)
// ---------------------------------------------------------------------------

// Reference path: GET /compendium/{endpoint}?world=... → { data: Row[], total, limit, offset }
// Confirmed at characters.ts / compendium.ts
const REFERENCE_RESPONSE = {
  data: [{ slug: 'fireball', source: 'PHB', name: 'Fireball' }],
  total: 1,
  limit: 50,
  offset: 0,
};

// World-knowledge path: GET /characters/:id/knowledge/:kind → { rows, total, knownCount, effectiveView }
// Confirmed at characters.ts:1835-1840, read-character-codex.ts:63-68
const KNOWLEDGE_RESPONSE = {
  rows: [{ slug: 'goblin', source: 'MM', name: 'Goblin', cr: '1/4', type: 'humanoid', size: 'S', known: true }],
  total: 100,
  knownCount: 1,
  effectiveView: 'player' as const,
};

const KNOWLEDGE_EMPTY_RESPONSE = {
  rows: [],
  total: 0,
  knownCount: 0,
  effectiveView: 'player' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodexKindPage — routing split (B-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Reference family (REQ-CK-GATE-08) ─────────────────────────────────────

  it('reference kind "spells" → fetches /compendium/spells?world=... → renders CompendiumList', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(REFERENCE_RESPONSE);

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'spells' }) });
    render(element as React.ReactElement);

    // CompendiumList rendered (reference path)
    const list = screen.getByTestId('compendium-list');
    expect(list).toBeTruthy();
    // CodexList NOT rendered (world-knowledge path)
    expect(screen.queryByTestId('codex-list')).toBeNull();
    // Data from reference response rendered
    expect(screen.getByText('Fireball')).toBeTruthy();
  });

  it('reference kind "items" → fetches /compendium/items → renders CompendiumList', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [{ slug: 'sword', source: 'PHB', name: 'Longsword' }],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'items' }) });
    render(element as React.ReactElement);

    expect(screen.getByTestId('compendium-list')).toBeTruthy();
    expect(screen.queryByTestId('codex-list')).toBeNull();
  });

  // ── World-knowledge family (REQ-CK-GATE-08) ───────────────────────────────

  it('world-knowledge kind "monsters" → fetches /characters/:id/knowledge/monsters → renders CodexList', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(KNOWLEDGE_RESPONSE);

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'monsters' }) });
    render(element as React.ReactElement);

    // CodexList rendered (world-knowledge path)
    const list = screen.getByTestId('codex-list');
    expect(list).toBeTruthy();
    expect(list.getAttribute('data-kind')).toBe('monsters');
    expect(list.getAttribute('data-effective-view')).toBe('player');
    // CompendiumList NOT rendered
    expect(screen.queryByTestId('compendium-list')).toBeNull();
    // Goblin rendered
    expect(screen.getByText('Goblin')).toBeTruthy();
  });

  it('world-knowledge kind "npcs" → gated-empty → renders CodexList (ADR-2 gated-empty, #1946)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(KNOWLEDGE_EMPTY_RESPONSE);

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'npcs' }) });
    render(element as React.ReactElement);

    expect(screen.getByTestId('codex-list')).toBeTruthy();
    expect(screen.queryByTestId('compendium-list')).toBeNull();
  });

  // ── Preview-as-player toggle forwarded as ?view=player (#1953) ────────────

  it('forwards ?view=player to the knowledge endpoint when dh:role toggle is player', async () => {
    const { getViewPreference } = await import('@/lib/role');
    vi.mocked(getViewPreference).mockResolvedValueOnce('player');
    vi.mocked(api.get).mockResolvedValueOnce(KNOWLEDGE_RESPONSE);

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'monsters' }) });
    render(element as React.ReactElement);

    const url = vi.mocked(api.get).mock.calls[0]![0] as string;
    expect(url).toContain('/characters/char-active/knowledge/monsters');
    expect(url).toContain('view=player');
  });

  it('omits ?view= when dh:role toggle is not player (GM default = full view)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(KNOWLEDGE_RESPONSE);

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'monsters' }) });
    render(element as React.ReactElement);

    const url = vi.mocked(api.get).mock.calls[0]![0] as string;
    expect(url).not.toContain('view=');
  });

  // ── Empty state (REQ-CK-GATE-09) ──────────────────────────────────────────

  it('world-knowledge with 0 known rows → empty-state message visible', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(KNOWLEDGE_EMPTY_RESPONSE);

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'monsters' }) });
    render(element as React.ReactElement);

    // CodexList rendered with 0 rows — CodexList shows empty state message internally.
    // The page must NOT 500 or show an error boundary.
    const list = screen.getByTestId('codex-list');
    expect(list).toBeTruthy();
    expect(list.getAttribute('data-total')).toBe('0');
  });

  // ── Unknown kind → notFound (ADR-3) ───────────────────────────────────────

  it('unknown kind "dragons" → notFound()', async () => {
    const { notFound } = await import('next/navigation');
    vi.mocked(notFound).mockImplementation(() => { throw new Error('notFound'); });

    await expect(
      CodexKindPage({ params: Promise.resolve({ kind: 'dragons' }) }),
    ).rejects.toThrow('notFound');
  });

  // ── No active character for world-knowledge ────────────────────────────────

  it('world-knowledge with no active character → empty state without 500', async () => {
    const { getActiveCharacter } = await import('@/lib/active-character');
    vi.mocked(getActiveCharacter).mockResolvedValueOnce(null);

    const element = await CodexKindPage({ params: Promise.resolve({ kind: 'monsters' }) });
    render(element as React.ReactElement);

    // Should render a graceful empty state, NOT throw
    expect(screen.getByText(/seleccioná un personaje/i)).toBeTruthy();
  });
});
