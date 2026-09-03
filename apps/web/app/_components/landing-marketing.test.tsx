/**
 * Tests for LandingMarketing — portfolio-facing landing page shell.
 *
 * ux-p2-consistency Fix 4: the landing was just a title + 2 buttons on
 * emptiness. LandingMarketing adds a hero, feature highlights, and a
 * footer within the existing dark aesthetic, while keeping the existing
 * demo + Discord CTAs (passed in via ctaSlot — regression check).
 *
 * page.tsx is an async Server Component (redirect + Supabase auth check),
 * so the static marketing shell is extracted here to be unit-testable.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LandingMarketing } from './landing-marketing';

describe('LandingMarketing', () => {
  it('renders the hero heading with product name', () => {
    const { getByRole } = render(<LandingMarketing ctaSlot={null} />);
    expect(getByRole('heading', { level: 1 }).textContent).toContain('Dungeon Hub');
  });

  it('renders a one-line value prop under the hero', () => {
    const { getByText } = render(<LandingMarketing ctaSlot={null} />);
    expect(getByText(/gremio/i)).toBeTruthy();
  });

  it('renders 3-4 feature highlight items', () => {
    const { container } = render(<LandingMarketing ctaSlot={null} />);
    const items = container.querySelectorAll('[data-landing-feature]');
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(4);
  });

  it('renders a footer', () => {
    const { container } = render(<LandingMarketing ctaSlot={null} />);
    expect(container.querySelector('footer')).toBeTruthy();
  });

  it('regression: renders the ctaSlot content (existing demo + Discord CTAs)', () => {
    const { getByText } = render(
      <LandingMarketing ctaSlot={<button type="button">Iniciar demo</button>} />,
    );
    expect(getByText('Iniciar demo')).toBeTruthy();
  });

  it('regression: renders the devSlot content when provided', () => {
    const { getByText } = render(
      <LandingMarketing ctaSlot={null} devSlot={<div>Dev login</div>} />,
    );
    expect(getByText('Dev login')).toBeTruthy();
  });
});
