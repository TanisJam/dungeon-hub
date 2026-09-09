
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { V3Empty } from './empty';

describe('V3Empty', () => {
  it('T1: renders the title prop as visible text', () => {
    render(<V3Empty glyph="home" title="Próximamente" />);
    expect(screen.getByRole('heading', { name: 'Próximamente' })).toBeTruthy();
  });

  it('T2: renders sub when provided; absent when omitted', () => {
    const { rerender } = render(<V3Empty glyph="home" title="Próximamente" sub="Tu panel vivirá acá." />);
    expect(screen.getByText('Tu panel vivirá acá.')).toBeTruthy();

    rerender(<V3Empty glyph="home" title="Próximamente" />);
    expect(screen.queryByText('Tu panel vivirá acá.')).toBeNull();
  });

  it('T3: renders an Icon element (svg with aria-hidden)', () => {
    render(<V3Empty glyph="shield" title="Sin datos" />);
    // Icon renders an svg with aria-hidden="true"
    const svg = document.querySelector('svg[aria-hidden="true"]');
    expect(svg).toBeTruthy();
  });

  // T4 — codex-rehome ADR-5 / REQ-EMPTY-01
  it('T4: renders CTA link with correct href and label when cta prop is provided', () => {
    render(
      <V3Empty
        glyph="user"
        title="Todavía no tenés un personaje activo"
        sub="El Códex se centra en tu personaje activo."
        cta={{ label: 'Elegí o creá un personaje', href: '/personajes' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Elegí o creá un personaje' });
    expect(link).toBeTruthy();
    expect((link as HTMLAnchorElement).href).toContain('/personajes');
  });

  it('T4b: CTA link has min-h-[44px] tap-target class (mobile-first REQ-EMPTY-01)', () => {
    render(
      <V3Empty
        glyph="user"
        title="Sin personaje"
        cta={{ label: 'Ir a personajes', href: '/personajes' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Ir a personajes' });
    expect(link.className).toContain('min-h-[44px]');
  });

  // T5 — codex-rehome ADR-5
  it('T5: no CTA rendered when cta prop is omitted', () => {
    render(<V3Empty glyph="home" title="Vacío" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
