import { describe, it, expect } from 'vitest';
import type { FeedItem } from '@/app/bitacora/actions';
import { feedItemToNovedad, feedItemsToNovedades } from './feed-to-novedad';

const NOW = new Date('2026-09-02T12:00:00.000Z').getTime();

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'feed-1',
    source: 'gremio',
    title: null,
    body: null,
    tags: [],
    sortAt: new Date('2026-09-02T10:00:00.000Z').toISOString(), // 2h before NOW
    visibility: 'guild',
    ...overrides,
  };
}

describe('feedItemToNovedad', () => {
  it('prefers the explicit title as the headline', () => {
    const n = feedItemToNovedad(makeItem({ title: 'Goblins en el paso' }), NOW);
    expect(n.ttl).toBe('Goblins en el paso');
  });

  it('falls back to the resolved entity name when there is no title', () => {
    const n = feedItemToNovedad(
      makeItem({ title: null, refEntityName: 'Ogro de las Colinas' }),
      NOW,
    );
    expect(n.ttl).toBe('Ogro de las Colinas');
  });

  it('falls back to a truncated body when there is no title or entity name', () => {
    const long = 'a'.repeat(80);
    const n = feedItemToNovedad(makeItem({ body: long }), NOW);
    expect(n.ttl.endsWith('…')).toBe(true);
    expect(n.ttl.length).toBeLessThanOrEqual(60);
  });

  it('falls back to the source label when nothing else is present', () => {
    expect(feedItemToNovedad(makeItem({ source: 'gremio' }), NOW).ttl).toBe('Aporte del gremio');
    expect(feedItemToNovedad(makeItem({ source: 'dm' }), NOW).ttl).toBe('Nota del DM');
    expect(feedItemToNovedad(makeItem({ source: 'evento' }), NOW).ttl).toBe('Evento del mundo');
  });

  it('surfaces the West Marches seal status for guild sightings', () => {
    expect(
      feedItemToNovedad(makeItem({ sealedStatus: 'confirmed' }), NOW).sub,
    ).toBe('Confirmado · gremio');
    expect(
      feedItemToNovedad(makeItem({ sealedStatus: 'debunked' }), NOW).sub,
    ).toBe('Desmentido · gremio');
  });

  it('computes the relative age from sortAt', () => {
    expect(feedItemToNovedad(makeItem(), NOW).when).toBe('hace 2 horas');
  });

  it('marks items within the last 24h as fresh', () => {
    expect(feedItemToNovedad(makeItem(), NOW).fresh).toBe(true);
    const old = makeItem({ sortAt: new Date('2026-08-30T12:00:00.000Z').toISOString() });
    expect(feedItemToNovedad(old, NOW).fresh).toBe(false);
  });

  it('carries the feed id through as the stable key', () => {
    expect(feedItemToNovedad(makeItem({ id: 'abc-123' }), NOW).id).toBe('abc-123');
  });
});

describe('feedItemsToNovedades', () => {
  it('maps a list preserving order', () => {
    const items = [
      makeItem({ id: '1', title: 'Uno' }),
      makeItem({ id: '2', title: 'Dos' }),
    ];
    const out = feedItemsToNovedades(items, NOW);
    expect(out.map((n) => n.id)).toEqual(['1', '2']);
    expect(out.map((n) => n.ttl)).toEqual(['Uno', 'Dos']);
  });

  it('returns an empty array for an empty feed', () => {
    expect(feedItemsToNovedades([], NOW)).toEqual([]);
  });
});
