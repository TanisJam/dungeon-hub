/**
 * Maps the unified guild bitácora feed (FeedItem) to the /inicio NovedadesFeed
 * display type (Novedad).
 *
 * Pure + deterministic: `now` is injectable so the relative-age string is
 * unit-testable without freezing the system clock. Wires the already-shipped
 * `aggregateGuildFeed` backend (via listGuildBitacoraFeed) into the home widget
 * that previously rendered a hardcoded empty list.
 */

import type { FeedItem, FeedSource } from '@/app/bitacora/actions';
import type { Novedad } from './types';

const SOURCE_LABEL: Record<FeedSource, string> = {
  gremio: 'Aporte del gremio',
  dm: 'Nota del DM',
  evento: 'Evento del mundo',
};

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Relative-age string, Rioplatense. Mirrors the /inicio page helper. */
function relativeAge(fromIso: string, now: number): string {
  const diffMs = now - new Date(fromIso).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const weeks = Math.floor(days / 7);
  return `hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Short context line. Guild sightings surface their canonical seal status
 * (confirmed/debunked) — the West Marches truth layer — otherwise a source tag.
 */
function subtitleFor(item: FeedItem): string {
  if (item.source === 'gremio') {
    if (item.sealedStatus === 'confirmed') return 'Confirmado · gremio';
    if (item.sealedStatus === 'debunked') return 'Desmentido · gremio';
  }
  return SOURCE_LABEL[item.source];
}

export function feedItemToNovedad(item: FeedItem, now: number = Date.now()): Novedad {
  const headline =
    item.title?.trim() ||
    item.refEntityName?.trim() ||
    (item.body ? truncate(item.body, 60) : '') ||
    SOURCE_LABEL[item.source];

  return {
    id: item.id,
    ttl: headline,
    sub: subtitleFor(item),
    when: relativeAge(item.sortAt, now),
    fresh: now - new Date(item.sortAt).getTime() < FRESH_WINDOW_MS,
  };
}

export function feedItemsToNovedades(items: FeedItem[], now: number = Date.now()): Novedad[] {
  return items.map((item) => feedItemToNovedad(item, now));
}
