/**
 * Pill component tests — strict TDD B2 batch.
 * Tests: existing 6 tones, both sizes, default props, new danger + success tones.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Pill } from './pill';

describe('Pill', () => {
  // ── Existing tones ────────────────────────────────────────────────────────

  it('renders with tone="primary" applying bg-primary-soft text-primary-deep', () => {
    render(<Pill tone="primary">Active</Pill>);
    const el = screen.getByText('Active');
    expect(el.className).toContain('bg-primary-soft');
    expect(el.className).toContain('text-primary-deep');
  });

  it('renders with tone="accent" applying bg-accent-soft text-accent-deep', () => {
    render(<Pill tone="accent">Player</Pill>);
    const el = screen.getByText('Player');
    expect(el.className).toContain('bg-accent-soft');
    expect(el.className).toContain('text-accent-deep');
  });

  it('renders with tone="secondary" applying bg-secondary-soft text-secondary-deep', () => {
    render(<Pill tone="secondary">DM</Pill>);
    const el = screen.getByText('DM');
    expect(el.className).toContain('bg-secondary-soft');
    expect(el.className).toContain('text-secondary-deep');
  });

  it('renders with tone="ink" applying bg-ink text-surface', () => {
    render(<Pill tone="ink">Ink</Pill>);
    const el = screen.getByText('Ink');
    expect(el.className).toContain('bg-ink');
    expect(el.className).toContain('text-surface');
  });

  it('renders with tone="stone" applying bg-paper-soft text-ink-soft', () => {
    render(<Pill tone="stone">Stone</Pill>);
    const el = screen.getByText('Stone');
    expect(el.className).toContain('bg-paper-soft');
    expect(el.className).toContain('text-ink-soft');
  });

  it('renders with tone="amber" applying bg-warning-soft text-warning-deep', () => {
    render(<Pill tone="amber">Amber</Pill>);
    const el = screen.getByText('Amber');
    expect(el.className).toContain('bg-warning-soft');
    expect(el.className).toContain('text-warning-deep');
  });

  // ── Sizes ─────────────────────────────────────────────────────────────────

  it('renders size="sm" applying px-2 py-0.5 text-[10px]', () => {
    render(<Pill size="sm">Small</Pill>);
    const el = screen.getByText('Small');
    expect(el.className).toContain('px-2');
    expect(el.className).toContain('py-0.5');
    expect(el.className).toContain('text-[10px]');
  });

  it('renders size="md" applying px-2.5 py-0.5 text-xs', () => {
    render(<Pill size="md">Medium</Pill>);
    const el = screen.getByText('Medium');
    expect(el.className).toContain('px-2.5');
    expect(el.className).toContain('text-xs');
  });

  // ── Default props ─────────────────────────────────────────────────────────

  it('defaults to tone="stone" and size="md" when no props given', () => {
    render(<Pill>Default</Pill>);
    const el = screen.getByText('Default');
    // stone default
    expect(el.className).toContain('bg-paper-soft');
    expect(el.className).toContain('text-ink-soft');
    // md default
    expect(el.className).toContain('px-2.5');
    expect(el.className).toContain('text-xs');
  });

  // ── New tones (B2) ────────────────────────────────────────────────────────

  it('renders with tone="danger" applying bg-danger-soft text-danger', () => {
    render(<Pill tone="danger">Danger</Pill>);
    const el = screen.getByText('Danger');
    expect(el.className).toContain('bg-danger-soft');
    expect(el.className).toContain('text-danger');
  });

  it('renders with tone="success" applying bg-success-soft text-success', () => {
    render(<Pill tone="success">Success</Pill>);
    const el = screen.getByText('Success');
    expect(el.className).toContain('bg-success-soft');
    expect(el.className).toContain('text-success');
  });

  // ── data-tone attribute ────────────────────────────────────────────────────

  it('sets data-tone attribute to the tone value', () => {
    render(<Pill tone="danger">Test</Pill>);
    const el = screen.getByText('Test');
    expect(el.getAttribute('data-tone')).toBe('danger');
  });

  // ── fill axis (B3) ────────────────────────────────────────────────────────

  it('fill="soft" (default) tone="primary" renders existing soft classes unchanged — zero-regression', () => {
    render(<Pill tone="primary">Soft</Pill>);
    const el = screen.getByText('Soft');
    expect(el.className).toContain('bg-primary-soft');
    expect(el.className).toContain('text-primary-deep');
  });

  it('fill="solid" tone="accent" → bg-accent and text-on-accent', () => {
    render(<Pill tone="accent" fill="solid">Solid</Pill>);
    const el = screen.getByText('Solid');
    expect(el.className).toContain('bg-accent');
    expect(el.className).toContain('text-on-accent');
  });

  it('fill="outline" tone="neutral" → border-white/40 and text-white/90 and bg-transparent', () => {
    render(<Pill tone="neutral" fill="outline">Ghost</Pill>);
    const el = screen.getByText('Ghost');
    expect(el.className).toContain('border-white/40');
    expect(el.className).toContain('text-white/90');
    expect(el.className).toContain('bg-transparent');
  });

  it('fill="tint" tone="primary" → bg-primary/10 and border-primary/40 and text-primary', () => {
    render(<Pill tone="primary" fill="tint">Tint</Pill>);
    const el = screen.getByText('Tint');
    expect(el.className).toContain('bg-primary/10');
    expect(el.className).toContain('border-primary/40');
    expect(el.className).toContain('text-primary');
  });

  it('fill="outline" tone="primary" → border-primary/50 and text-primary', () => {
    render(<Pill tone="primary" fill="outline">Outline Primary</Pill>);
    const el = screen.getByText('Outline Primary');
    expect(el.className).toContain('border-primary/50');
    expect(el.className).toContain('text-primary');
  });

  it('className prop is merged into output', () => {
    render(<Pill tone="stone" className="mb-1">Merge</Pill>);
    const el = screen.getByText('Merge');
    expect(el.className).toContain('mb-1');
  });

  it('base classes (rounded-pill, size) are present regardless of fill', () => {
    render(<Pill tone="neutral" fill="solid" size="sm">Base</Pill>);
    const el = screen.getByText('Base');
    expect(el.className).toContain('rounded-pill');
    expect(el.className).toContain('px-2');
    expect(el.className).toContain('text-[10px]');
  });

  // ── neutral tone ─────────────────────────────────────────────────────────

  it('tone="neutral" fill="soft" (default) → bg-paper-soft text-ink-soft', () => {
    render(<Pill tone="neutral">Neutral</Pill>);
    const el = screen.getByText('Neutral');
    expect(el.className).toContain('bg-paper-soft');
    expect(el.className).toContain('text-ink-soft');
  });
});
