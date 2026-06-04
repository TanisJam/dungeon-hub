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
});
