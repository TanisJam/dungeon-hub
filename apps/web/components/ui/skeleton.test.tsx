import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a div with aria-hidden so it is invisible to assistive tech', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies animate-pulse and motion-reduce:animate-none', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('motion-reduce:animate-none');
  });

  it('uses the on-scale bg-surface-soft token and rounded-sm radius', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-surface-soft');
    expect(el.className).toContain('rounded-sm');
  });

  it('merges a caller-supplied className (e.g. for sizing)', () => {
    const { container } = render(<Skeleton className="h-4 w-2/3" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('h-4');
    expect(el.className).toContain('w-2/3');
  });

  it('forwards extra HTML attributes (e.g. data-testid)', () => {
    const { container } = render(<Skeleton data-testid="hero-skeleton" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('data-testid')).toBe('hero-skeleton');
  });
});
