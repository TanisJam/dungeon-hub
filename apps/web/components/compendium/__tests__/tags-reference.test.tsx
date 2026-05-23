import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { InlineRenderer } from '../inline';

function refAttr(html: string): string | null {
  const m = html.match(/data-compendium-ref="([^"]+)"/);
  return m?.[1] ?? null;
}

describe('reference tag handlers (Phase B)', () => {
  it('{@spell fireball|PHB} emits data-compendium-ref="spell|fireball|PHB"', () => {
    const { container } = render(<InlineRenderer text="{@spell fireball|PHB}" />);
    expect(refAttr(container.innerHTML)).toBe('spell|fireball|PHB');
  });

  it('{@creature goblin} (no source segment) defaults to PHB', () => {
    const { container } = render(<InlineRenderer text="{@creature goblin}" />);
    expect(refAttr(container.innerHTML)).toBe('creature|goblin|PHB');
  });

  it('{@skill Perception} slugifies the first segment (lowercase)', () => {
    const { container } = render(<InlineRenderer text="{@skill Perception}" />);
    expect(refAttr(container.innerHTML)).toBe('skill|perception|PHB');
    // Display text falls back to the raw first segment when no displayText
    expect(container.textContent).toBe('Perception');
  });

  it('uses pipe-segment-3 as visible display when provided', () => {
    const { container } = render(<InlineRenderer text="{@spell fireball|PHB|Fireball}" />);
    expect(container.textContent).toBe('Fireball');
  });

  it('preserves explicit non-PHB source', () => {
    const { container } = render(<InlineRenderer text="{@item Bag of Holding|DMG}" />);
    expect(refAttr(container.innerHTML)).toBe('item|bag-of-holding|DMG');
  });

  it('{@condition Prone} slugifies and routes to condition kind', () => {
    const { container } = render(<InlineRenderer text="{@condition Prone}" />);
    expect(refAttr(container.innerHTML)).toBe('condition|prone|PHB');
  });

  it('{@status Concentration} routes to status kind (separate from condition)', () => {
    const { container } = render(<InlineRenderer text="{@status Concentration}" />);
    expect(refAttr(container.innerHTML)).toBe('status|concentration|PHB');
  });

  it("{@class Fighter} → kind=class", () => {
    const { container } = render(<InlineRenderer text="{@class Fighter}" />);
    expect(refAttr(container.innerHTML)).toBe('class|fighter|PHB');
  });

  it('still emits a styled span for unsupported tag families (falls back to UnknownTag)', () => {
    const { container } = render(<InlineRenderer text="{@futureTag whatever|extra}" />);
    expect(refAttr(container.innerHTML)).toBeNull();
    expect(container.textContent).toBe('whatever');
  });
});

describe('B.3 extended reference tags', () => {
  it('{@quickref Cover||3} renders without data-compendium-ref', () => {
    const { container } = render(<InlineRenderer text="{@quickref Cover||3}" />);
    expect(refAttr(container.innerHTML)).toBeNull();
    expect(container.textContent).toBe('Cover');
  });

  it('{@5etoolsImg caption|path/to.png} renders a <figure> with data-image-ref', () => {
    const { container } = render(<InlineRenderer text="{@5etoolsImg cool image|imgs/cool.png}" />);
    const fig = container.querySelector('figure');
    expect(fig).not.toBeNull();
    expect(fig?.getAttribute('data-image-ref')).toBe('imgs/cool.png');
    expect(fig?.textContent).toBe('cool image');
  });

  it('{@classFeature Action Surge|Fighter|PHB|2} emits classFeature ref', () => {
    const { container } = render(<InlineRenderer text="{@classFeature Action Surge|Fighter|PHB|2}" />);
    expect(refAttr(container.innerHTML)).toBe('classFeature|action-surge|PHB');
  });

  it('{@area A1|Map of the Dungeon} emits data-area-ref', () => {
    const { container } = render(<InlineRenderer text="{@area A1|Map of the Dungeon}" />);
    expect(container.querySelector('[data-area-ref="A1"]')).not.toBeNull();
  });
});
