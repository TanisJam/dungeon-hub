// Tests for searchCompendium and getCompendiumDetail Server Actions.
// ADR-3 (list search) + ADR-4 (detail fetch).
// Phase 1 (codex-rehome): scope discriminator {campaign} | {world} — ADR-2.
// Mocks api.get and Supabase createClient.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted above imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

// Registry mock — ensure CATEGORY_CONFIG is available
vi.mock('@/app/compendium/[category]/_config/registry', () => ({
  CATEGORY_CONFIG: {
    spells: { endpoint: 'spells', label: 'Hechizos', RowView: () => null, Header: () => null },
    items: { endpoint: 'items', label: 'Items', RowView: () => null, Header: () => null },
    races: { endpoint: 'races', label: 'Razas', RowView: () => null, Header: () => null },
    classes: { endpoint: 'classes', label: 'Clases', RowView: () => null, Header: () => null },
    backgrounds: { endpoint: 'backgrounds', label: 'Trasfondos', RowView: () => null, Header: () => null },
    monsters: { endpoint: 'monsters', label: 'Monstruos', RowView: () => null, Header: () => null },
  },
}));

import { searchCompendium, getCompendiumDetail } from '../actions';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase/server';

const CAMPAIGN_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const WORLD_ID    = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const SESSION_TOKEN = 'test-access-token';

function mockSession() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: SESSION_TOKEN } },
      }),
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
}

// ---------------------------------------------------------------------------
// searchCompendium tests — ADR-3
// ---------------------------------------------------------------------------

describe('searchCompendium', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession();
  });

  it('returns rows and total on success with correct URL (campaign scope + q + offset)', async () => {
    const mockRows = [{ slug: 'fireball', name: 'Fireball', level: 3, school: 'E', source: 'PHB' }];
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockRows, total: 1 });

    const result = await searchCompendium('spells', { campaign: CAMPAIGN_ID }, 'fire', 0);

    expect(result).toEqual({ rows: mockRows, total: 1 });
    // Assert URL contains campaign, q, and offset
    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).toContain('/compendium/spells');
    expect(calledUrl).toContain(`campaign=${CAMPAIGN_ID}`);
    expect(calledUrl).toContain('q=fire');
    expect(calledUrl).toContain('offset=0');
  });

  it('returns { rows: [], total: 0 } when api.get throws', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

    const result = await searchCompendium('spells', { campaign: CAMPAIGN_ID }, 'fire', 0);

    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('returns { rows: [], total: 0 } for invalid scope id (non-UUID campaign)', async () => {
    const result = await searchCompendium('spells', { campaign: 'not-a-uuid' }, 'fire', 0);
    expect(result).toEqual({ rows: [], total: 0 });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('returns { rows: [], total: 0 } when no session', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const result = await searchCompendium('spells', { campaign: CAMPAIGN_ID }, 'fire', 0);
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('omits ?q= param when query is empty', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [], total: 0 });

    await searchCompendium('spells', { campaign: CAMPAIGN_ID }, '', 0);

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).not.toContain('q=');
  });

  // #3.4 — item type filter param
  it('appends extra filter params (items ?type=) to the URL', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [], total: 0 });

    await searchCompendium('items', { campaign: CAMPAIGN_ID }, '', 0, { type: 'M' });

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).toContain('/compendium/items');
    expect(calledUrl).toContain('type=M');
  });

  it('omits empty filter values from the URL', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [], total: 0 });

    await searchCompendium('items', { campaign: CAMPAIGN_ID }, '', 0, { type: '' });

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).not.toContain('type=');
  });
});

// ---------------------------------------------------------------------------
// getCompendiumDetail tests — ADR-4
// ---------------------------------------------------------------------------

describe('getCompendiumDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession();
  });

  it('calls the correct URL with BOTH ?campaign= and ?source= params (campaign scope)', async () => {
    const mockDetail = { slug: 'fireball', source: 'PHB', name: 'Fireball', level: 3 };
    vi.mocked(api.get).mockResolvedValueOnce(mockDetail);

    const result = await getCompendiumDetail('spells', { campaign: CAMPAIGN_ID }, 'fireball', 'PHB');

    expect(result).toEqual(mockDetail);
    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    // ADR-4 CRITICAL: BOTH scope and source must be present
    expect(calledUrl).toContain('/compendium/spells/fireball');
    expect(calledUrl).toContain(`campaign=${CAMPAIGN_ID}`);
    expect(calledUrl).toContain('source=PHB');
  });

  it('returns null when api.get throws (404 / network error)', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Not found'));

    const result = await getCompendiumDetail('spells', { campaign: CAMPAIGN_ID }, 'fake-slug', 'PHB');

    expect(result).toBeNull();
  });

  it('returns null for invalid scope id (non-UUID campaign)', async () => {
    const result = await getCompendiumDetail('spells', { campaign: 'bad-id' }, 'fireball', 'PHB');
    expect(result).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 1 — scope discriminator tests (codex-rehome ADR-2)
// REQ-CBROWSE-05 regression guard: campaign scope still builds ?campaign=;
// world scope builds ?world= (player Codex path).
// ---------------------------------------------------------------------------

// Task 1.1 — searchCompendium scope discriminator (RED → GREEN after 1.3)
describe('searchCompendium — scope discriminator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession();
  });

  it('scope:{campaign} builds ?campaign= URL (backward-compatible /compendium browser path)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [], total: 0 });

    await searchCompendium('spells', { campaign: CAMPAIGN_ID }, 'fire', 0);

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).toContain(`campaign=${CAMPAIGN_ID}`);
    expect(calledUrl).not.toContain('world=');
  });

  it('scope:{world} builds ?world= URL (player Codex path)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [], total: 0 });

    await searchCompendium('spells', { world: WORLD_ID }, '', 0);

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).toContain(`world=${WORLD_ID}`);
    expect(calledUrl).not.toContain('campaign=');
  });

  it('scope with neither campaign nor world returns { rows:[], total:0 } without calling api', async () => {
    // @ts-expect-error — intentionally passing malformed scope to test guard
    const result = await searchCompendium('spells', {}, 'fire', 0);
    expect(result).toEqual({ rows: [], total: 0 });
    expect(api.get).not.toHaveBeenCalled();
  });
});

// Task 1.2 — getCompendiumDetail scope discriminator (RED → GREEN after 1.3)
describe('getCompendiumDetail — scope discriminator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession();
  });

  it('scope:{campaign} builds ?campaign=&source= URL', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ slug: 'fireball', name: 'Fireball' });

    await getCompendiumDetail('spells', { campaign: CAMPAIGN_ID }, 'fireball', 'PHB');

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).toContain(`campaign=${CAMPAIGN_ID}`);
    expect(calledUrl).toContain('source=PHB');
    expect(calledUrl).not.toContain('world=');
  });

  it('scope:{world} builds ?world=&source= URL (player Codex detail path)', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ slug: 'fireball', name: 'Fireball' });

    await getCompendiumDetail('spells', { world: WORLD_ID }, 'fireball', 'PHB');

    const [calledUrl] = vi.mocked(api.get).mock.calls[0] as [string, string];
    expect(calledUrl).toContain(`world=${WORLD_ID}`);
    expect(calledUrl).toContain('source=PHB');
    expect(calledUrl).not.toContain('campaign=');
  });

  it('scope with neither campaign nor world returns null without calling api', async () => {
    // @ts-expect-error — intentionally passing malformed scope to test guard
    const result = await getCompendiumDetail('spells', {}, 'fireball', 'PHB');
    expect(result).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });
});
