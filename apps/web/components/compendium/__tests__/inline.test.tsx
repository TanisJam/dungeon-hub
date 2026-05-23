import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { InlineRenderer, parseInline, takeDisplay, takeFirstSegment } from '../inline';

describe('parseInline', () => {
  it('returns a single text token for plain prose', () => {
    expect(parseInline('hello world')).toEqual([
      { kind: 'text', text: 'hello world' },
    ]);
  });

  it('extracts a single tag with no surrounding text', () => {
    expect(parseInline('{@b Bold}')).toEqual([
      { kind: 'tag', name: 'b', args: 'Bold' },
    ]);
  });

  it('interleaves text and tags', () => {
    const tokens = parseInline('You take {@damage 2d6} fire damage.');
    expect(tokens).toEqual([
      { kind: 'text', text: 'You take ' },
      { kind: 'tag', name: 'damage', args: '2d6' },
      { kind: 'text', text: ' fire damage.' },
    ]);
  });

  it('parses tags with no args', () => {
    expect(parseInline('text {@h} more')).toEqual([
      { kind: 'text', text: 'text ' },
      { kind: 'tag', name: 'h', args: '' },
      { kind: 'text', text: ' more' },
    ]);
  });
});

describe('takeDisplay / takeFirstSegment', () => {
  it('takeDisplay returns the third pipe segment when present', () => {
    expect(takeDisplay('fireball|PHB|Fireball')).toBe('Fireball');
  });

  it('takeDisplay falls back to the first segment when only one is given', () => {
    expect(takeDisplay('goblin')).toBe('goblin');
  });

  it('takeFirstSegment ignores trailing pipes', () => {
    expect(takeFirstSegment('15|something')).toBe('15');
  });
});

describe('InlineRenderer', () => {
  it('renders plain text as nested spans without crashing', () => {
    const { container } = render(<InlineRenderer text="hello world" />);
    expect(container.textContent).toBe('hello world');
  });

  it('falls back to display text for unknown future tags', () => {
    const { container } = render(<InlineRenderer text="{@unknownFuture foo|bar}" />);
    // Phase A has no handlers registered, so this exercises the UnknownTag path.
    expect(container.textContent).toBe('foo');
  });

  it('does not throw on a tag with no args', () => {
    expect(() => render(<InlineRenderer text="{@h}" />)).not.toThrow();
  });
});
