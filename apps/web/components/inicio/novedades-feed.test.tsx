/**
 * Unit tests for NovedadesFeed component.
 *
 * T1: Renders SectionHead with "Novedades del gremio" (FEED-01).
 * T2: Items with fresh=true have class inicio-feed-dot on their dot span;
 *     items with fresh=false have bg-ink-mute and NOT inicio-feed-dot (FEED-01).
 * T3: All fresh=false items — no element has class inicio-feed-dot (FEED-01 scenario 2).
 * T4: items=[] → V3Empty is present and contains text "Sin novedades" (FEED-02).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NovedadesFeed } from './novedades-feed';
import type { Novedad } from './mock-data';

const mixedItems: Novedad[] = [
  { id: 'n1', ttl: 'Mara subió a nivel 4',          sub: 'Druida',  when: 'hace 2h', fresh: true  },
  { id: 'n2', ttl: 'Nueva quest',                    sub: 'Pacto',   when: 'hace 6h', fresh: true  },
  { id: 'n3', ttl: 'Sesión 7 cerrada',               sub: 'XP',      when: 'ayer',    fresh: false },
];

const staleItems: Novedad[] = [
  { id: 's1', ttl: 'Evento pasado 1', sub: 'ctx', when: 'semana', fresh: false },
  { id: 's2', ttl: 'Evento pasado 2', sub: 'ctx', when: '2 sem',  fresh: false },
];

describe('NovedadesFeed', () => {
  it('T1: renders the SectionHead with "Novedades del gremio"', () => {
    render(<NovedadesFeed items={mixedItems} />);
    expect(screen.getByText('Novedades del gremio')).toBeTruthy();
  });

  it('T2: fresh=true items have inicio-feed-dot on dot span; fresh=false items have bg-ink-mute', () => {
    const { container } = render(<NovedadesFeed items={mixedItems} />);
    const freshDots = container.querySelectorAll('.inicio-feed-dot');
    // 2 items are fresh=true
    expect(freshDots.length).toBe(2);

    // The stale item's dot should NOT have inicio-feed-dot
    const staleDots = container.querySelectorAll('.bg-ink-mute');
    expect(staleDots.length).toBeGreaterThanOrEqual(1);
  });

  it('T3: all fresh=false — no element has class inicio-feed-dot', () => {
    const { container } = render(<NovedadesFeed items={staleItems} />);
    const freshDots = container.querySelectorAll('.inicio-feed-dot');
    expect(freshDots.length).toBe(0);
  });

  it('T4: empty items array → V3Empty renders with "Sin novedades"', () => {
    render(<NovedadesFeed items={[]} />);
    expect(screen.getByText('Sin novedades')).toBeTruthy();
  });
});
