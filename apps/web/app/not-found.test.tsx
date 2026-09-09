
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import NotFound from './not-found';

describe('NotFound (branded 404)', () => {
  it('T1: renders Spanish heading and not the default Next.js copy', () => {
    const { container } = render(<NotFound />);
    expect(container.textContent).toContain('Página no encontrada');
    expect(container.textContent).not.toContain('This page could not be found.');
  });

  it('T2: renders a link back home to /inicio', () => {
    const { container } = render(<NotFound />);
    const link = container.querySelector('a[href="/inicio"]');
    expect(link).toBeTruthy();
  });

  it('T3: container uses dark-theme tokens', () => {
    const { container } = render(<NotFound />);
    const root = container.firstElementChild as HTMLElement;
    const hasToken =
      root.className.includes('bg-paper') ||
      root.className.includes('text-ink') ||
      root.className.includes('border-line');
    expect(hasToken).toBe(true);
  });
});
