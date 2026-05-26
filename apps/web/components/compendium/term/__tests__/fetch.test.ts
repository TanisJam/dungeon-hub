import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchTermEntry } from '../fetch';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

function makeFetchMock(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

const VALID_OPTS = {
  apiBaseUrl: 'http://api.example.com',
  worldId: 'world-uuid',
  accessToken: 'bearer-token-123',
};

const SPELL_ENTRY = {
  name: 'Fireball',
  entries: ['A bright streak flashes...'],
  source: 'PHB',
  sourceCitation: "Player's Handbook, p. 241",
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// URL shape tests
// ---------------------------------------------------------------------------

describe('fetchTermEntry — URL shape', () => {
  it('builds correct URL for a spell: /api/v1/compendium/spells/{slug}?world=...&source=...', async () => {
    const mockFetch = makeFetchMock(200, { data: SPELL_ENTRY });
    vi.stubGlobal('fetch', mockFetch);

    await fetchTermEntry('spell|fireball|PHB', VALID_OPTS);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/compendium/spells/fireball');
    expect(calledUrl).toContain('world=world-uuid');
    expect(calledUrl).toContain('source=PHB');
    expect(calledUrl.startsWith('http://api.example.com')).toBe(true);
  });

  it('maps creature → /api/v1/compendium/monsters/{slug} (irregular plural)', async () => {
    const mockFetch = makeFetchMock(200, { data: { name: 'Goblin', entries: [], source: 'MM' } });
    vi.stubGlobal('fetch', mockFetch);

    await fetchTermEntry('creature|goblin|MM', VALID_OPTS);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/compendium/monsters/goblin');
  });

  it('maps status → /api/v1/compendium/conditions/{slug}', async () => {
    const mockFetch = makeFetchMock(200, { data: { name: 'Concentration', entries: [], source: 'PHB' } });
    vi.stubGlobal('fetch', mockFetch);

    await fetchTermEntry('status|concentration|PHB', VALID_OPTS);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/v1/compendium/conditions/concentration');
  });
});

// ---------------------------------------------------------------------------
// Authorization header tests
// ---------------------------------------------------------------------------

describe('fetchTermEntry — Bearer header', () => {
  it('sends Authorization: Bearer {accessToken} header', async () => {
    const mockFetch = makeFetchMock(200, { data: SPELL_ENTRY });
    vi.stubGlobal('fetch', mockFetch);

    await fetchTermEntry('spell|fireball|PHB', VALID_OPTS);

    const calledInit = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = calledInit?.headers as Record<string, string>;
    expect(headers?.['Authorization']).toBe('Bearer bearer-token-123');
  });
});

// ---------------------------------------------------------------------------
// Missing env / configuration error
// ---------------------------------------------------------------------------

describe('fetchTermEntry — missing apiBaseUrl', () => {
  it('throws a descriptive error when apiBaseUrl is undefined', async () => {
    await expect(
      fetchTermEntry('spell|fireball|PHB', {
        apiBaseUrl: undefined as unknown as string,
        worldId: 'campaign-uuid',
        accessToken: 'token',
      })
    ).rejects.toThrow(/NEXT_PUBLIC_API_URL|apiBaseUrl/i);
  });

  it('throws a descriptive error when apiBaseUrl is empty string', async () => {
    await expect(
      fetchTermEntry('spell|fireball|PHB', {
        apiBaseUrl: '',
        worldId: 'campaign-uuid',
        accessToken: 'token',
      })
    ).rejects.toThrow(/NEXT_PUBLIC_API_URL|apiBaseUrl/i);
  });
});

// ---------------------------------------------------------------------------
// HTTP error scenarios
// ---------------------------------------------------------------------------

describe('fetchTermEntry — 401 response', () => {
  it('returns { kind: "error" } for a 401 Unauthorized response', async () => {
    vi.stubGlobal('fetch', makeFetchMock(401, { error: 'Unauthorized' }));

    const result = await fetchTermEntry('spell|fireball|PHB', VALID_OPTS);
    expect(result.kind).toBe('error');
  });

  it('includes a message in the error result for 401', async () => {
    vi.stubGlobal('fetch', makeFetchMock(401, { error: 'Unauthorized' }));

    const result = await fetchTermEntry('spell|fireball|PHB', VALID_OPTS);
    if (result.kind === 'error') {
      expect(result.message.length).toBeGreaterThan(0);
    } else {
      throw new Error('Expected kind: error, got kind: ok');
    }
  });
});

describe('fetchTermEntry — 404 response', () => {
  it('returns { kind: "error" } for a 404 Not Found response', async () => {
    vi.stubGlobal('fetch', makeFetchMock(404, { error: 'Not found' }));

    const result = await fetchTermEntry('spell|fireball|PHB', VALID_OPTS);
    expect(result.kind).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Successful 200 scenario
// ---------------------------------------------------------------------------

describe('fetchTermEntry — 200 response', () => {
  it('returns { kind: "ok", entry } on success', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { data: SPELL_ENTRY }));

    const result = await fetchTermEntry('spell|fireball|PHB', VALID_OPTS);
    expect(result.kind).toBe('ok');
  });

  it('maps response body data to TermEntry shape', async () => {
    vi.stubGlobal('fetch', makeFetchMock(200, { data: SPELL_ENTRY }));

    const result = await fetchTermEntry('spell|fireball|PHB', VALID_OPTS);
    if (result.kind !== 'ok') throw new Error(`Expected kind: ok, got ${result.kind}`);
    expect(result.entry.name).toBe('Fireball');
    expect(result.entry.source).toBe('PHB');
    expect(result.entry.entries).toHaveLength(1);
  });
});
