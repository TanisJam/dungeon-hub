import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashedCTA } from './dashed-cta';

describe('DashedCTA', () => {
  it('renders children', () => {
    render(<DashedCTA>Crear personaje</DashedCTA>);
    expect(screen.getByText('Crear personaje')).toBeTruthy();
  });

  it('applies dashed border classes', () => {
    const { container } = render(<DashedCTA>Label</DashedCTA>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('border-dashed');
    expect(el.className).toContain('border-line');
  });

  it('disabled variant applies cursor-not-allowed and opacity-70, no hover classes', () => {
    const { container } = render(<DashedCTA disabled>Crear</DashedCTA>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('cursor-not-allowed');
    expect(el.className).toContain('opacity-70');
    expect(el.className).not.toContain('hover:border-accent');
    expect(el.className).not.toContain('hover:text-accent');
  });

  it('renders as button by default', () => {
    render(<DashedCTA>Add</DashedCTA>);
    const btn = screen.getByRole('button', { name: 'Add' });
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('renders as anchor when href is provided', () => {
    render(<DashedCTA href="/campanas/new">Nueva campaña</DashedCTA>);
    const link = screen.getByRole('link', { name: 'Nueva campaña' });
    expect(link).toBeTruthy();
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/campanas/new');
  });

  it('passes additional className through', () => {
    const { container } = render(<DashedCTA className="mt-2">Label</DashedCTA>);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('mt-2');
  });

  it('disabled button has disabled attribute and aria-disabled', () => {
    render(<DashedCTA disabled>Próximamente</DashedCTA>);
    const btn = screen.getByRole('button', { name: 'Próximamente' });
    expect(btn).toHaveProperty('disabled', true);
  });
});
