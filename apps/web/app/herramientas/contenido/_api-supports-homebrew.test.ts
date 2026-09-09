import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiSupportsHomebrew } from './_api-supports-homebrew';

vi.mock('@/lib/env', () => ({ env: { API_URL: 'http://api.test' } }));

/**
 * The contract is narrow and load-bearing: 404 is the ONLY answer that hides the
 * section. Everything else — including failure — leaves it visible, because an
 * unknown answer must not make a working feature disappear.
 */
describe('apiSupportsHomebrew', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubStatus = (status: number) => {
    const fetchMock = vi.fn().mockResolvedValue({ status } as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('404 — the route is not deployed, so the section hides', async () => {
    stubStatus(404);
    expect(await apiSupportsHomebrew('w1', 't')).toBe(false);
  });

  it('400 — the route IS deployed and rejected the empty payload at validation', async () => {
    stubStatus(400);
    expect(await apiSupportsHomebrew('w1', 't')).toBe(true);
  });

  it('403 — deployed; the caller merely lacks GM on this world', async () => {
    stubStatus(403);
    expect(await apiSupportsHomebrew('w1', 't')).toBe(true);
  });

  it('500 — unknown, so the section stays and the real call reports the real problem', async () => {
    stubStatus(500);
    expect(await apiSupportsHomebrew('w1', 't')).toBe(true);
  });

  it('network failure — same reasoning: unknown never hides the section', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await apiSupportsHomebrew('w1', 't')).toBe(true);
  });

  it('probes with an empty items array, which cannot write anything', async () => {
    const fetchMock = stubStatus(400);
    await apiSupportsHomebrew('world-42', 'tok');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/worlds/world-42/homebrew/items');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ items: [] });
  });
});
