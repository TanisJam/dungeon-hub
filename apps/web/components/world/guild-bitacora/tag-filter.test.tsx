/**
 * Tests for TagFilter — horizontal chip row (bitacora-gremio W4).
 *
 * ux-p2-consistency Fix 3: the row is cut off mid-chip ("…Facciones") with
 * no scroll affordance. Assert overflow-x-auto + scroll-fade-r edge fade
 * are present (consistent with ScrollNav-based rows).
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { TagFilter } from './tag-filter';

describe('TagFilter', () => {
  it('renders overflow-x-auto and the scroll-fade-r edge-fade affordance', () => {
    const { getByLabelText } = render(
      <TagFilter activeTag={null} onTagChange={vi.fn()} />,
    );
    const root = getByLabelText('Filtro por etiqueta');
    expect(root.className).toContain('overflow-x-auto');
    expect(root.className).toContain('scroll-fade-r');
  });
});
