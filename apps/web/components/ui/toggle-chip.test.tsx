import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToggleChip } from './toggle-chip';

describe('ToggleChip', () => {
  it('renders children', () => {
    render(<ToggleChip>DM</ToggleChip>);
    expect(screen.getByText('DM')).toBeTruthy();
  });

  it('tone="secondary" active → has border-secondary/45 text-secondary bg-secondary-soft/60', () => {
    render(<ToggleChip tone="secondary" active>DM</ToggleChip>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('border-secondary/45');
    expect(btn.className).toContain('text-secondary');
    expect(btn.className).toContain('bg-secondary-soft/60');
  });

  it('tone="accent" active (default) → has border-accent/45 text-accent bg-accent-soft/60', () => {
    render(<ToggleChip active>PJ</ToggleChip>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('border-accent/45');
    expect(btn.className).toContain('text-accent');
    expect(btn.className).toContain('bg-accent-soft/60');
  });

  it('active={false} → has text-ink-mute and NOT bg-accent-soft/60', () => {
    render(<ToggleChip active={false}>PJ</ToggleChip>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-ink-mute');
    expect(btn.className).not.toContain('bg-accent-soft/60');
  });

  it('renders a <button> and aria-pressed reflects the prop', () => {
    render(<ToggleChip ariaPressed={true}>DM</ToggleChip>);
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('className is merged onto the button', () => {
    render(<ToggleChip className="extra-test-class">PJ</ToggleChip>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('extra-test-class');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<ToggleChip onClick={onClick}>PJ</ToggleChip>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
