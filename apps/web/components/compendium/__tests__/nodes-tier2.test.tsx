import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { EntryNodeRenderer } from '../index';

describe('section node', () => {
  it('renders <h3> heading (heavier than entries <h4>)', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'section', name: 'Racial Traits', entries: ['Some prose.'] }}
      />,
    );
    expect(container.querySelector('h3')?.textContent).toBe('Racial Traits');
    expect(container.querySelector('h4')).toBeNull();
  });
});

describe('inset / insetReadaloud nodes', () => {
  it('inset renders an <aside>', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'inset', name: 'Variant', entries: ['Variant body.'] }}
      />,
    );
    expect(container.querySelector('aside')).not.toBeNull();
    expect(container.querySelector('h4')?.textContent).toBe('Variant');
  });

  it('insetReadaloud renders italic <aside>', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'insetReadaloud', entries: ['Read this aloud.'] }}
      />,
    );
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside?.className).toContain('italic');
  });
});

describe('image / gallery nodes', () => {
  it('image renders a single <figure> with data-image-ref', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'image',
          href: { type: 'internal', path: 'imgs/dragon.png' },
          title: 'A Dragon',
        }}
      />,
    );
    const fig = container.querySelector('figure');
    expect(fig).not.toBeNull();
    expect(fig?.getAttribute('data-image-ref')).toBe('imgs/dragon.png');
    expect(fig?.textContent).toBe('A Dragon');
  });

  it('image with external href uses url for data-image-ref', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'image',
          href: { type: 'external', url: 'https://example.com/img.png' },
        }}
      />,
    );
    expect(container.querySelector('figure')?.getAttribute('data-image-ref')).toBe(
      'https://example.com/img.png',
    );
  });

  it('gallery with 3 images renders 3 <figure> elements', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'gallery',
          images: [
            { type: 'image', href: { type: 'internal', path: 'a.png' } },
            { type: 'image', href: { type: 'internal', path: 'b.png' } },
            { type: 'image', href: { type: 'internal', path: 'c.png' } },
          ],
        }}
      />,
    );
    expect(container.querySelectorAll('figure')).toHaveLength(3);
  });
});

describe('quote node', () => {
  it('renders <blockquote>', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'quote', entries: ['To be or not to be.'] }}
      />,
    );
    expect(container.querySelector('blockquote')).not.toBeNull();
  });

  it('renders <cite> when "by" is supplied', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{
          type: 'quote',
          entries: ['Knowledge is power.'],
          by: 'Francis Bacon',
        }}
      />,
    );
    expect(container.querySelector('cite')?.textContent).toBe('Francis Bacon');
  });

  it('falls back to "from" when no "by"', () => {
    const { container } = render(
      <EntryNodeRenderer
        entry={{ type: 'quote', entries: ['Words.'], from: 'Some Book' }}
      />,
    );
    expect(container.querySelector('cite')?.textContent).toBe('Some Book');
  });
});
