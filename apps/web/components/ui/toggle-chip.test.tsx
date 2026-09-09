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
    // The button is the 44px tap target; the tone classes live on the pill inside it.
    const pill = screen.getByRole('button').firstElementChild as HTMLElement;
    expect(pill.className).toContain('border-secondary/45');
    expect(pill.className).toContain('text-secondary');
    expect(pill.className).toContain('bg-secondary-soft/60');
  });

  it('tone="accent" active (default) → has border-accent/45 text-accent bg-accent-soft/60', () => {
    render(<ToggleChip active>PJ</ToggleChip>);
    // The button is the 44px tap target; the tone classes live on the pill inside it.
    const pill = screen.getByRole('button').firstElementChild as HTMLElement;
    expect(pill.className).toContain('border-accent/45');
    expect(pill.className).toContain('text-accent');
    expect(pill.className).toContain('bg-accent-soft/60');
  });

  it('active={false} → has text-ink-mute and NOT bg-accent-soft/60', () => {
    render(<ToggleChip active={false}>PJ</ToggleChip>);
    // The button is the 44px tap target; the tone classes live on the pill inside it.
    const pill = screen.getByRole('button').firstElementChild as HTMLElement;
    expect(pill.className).toContain('text-ink-mute');
    expect(pill.className).not.toContain('bg-accent-soft/60');
  });

  it('renders a <button> and aria-pressed reflects the prop', () => {
    render(<ToggleChip ariaPressed={true}>DM</ToggleChip>);
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('className is merged onto the button', () => {
    render(<ToggleChip className="extra-test-class">PJ</ToggleChip>);
    // className lands on the button — it is the outer element consumers position.
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

it('the tap target meets the 44px minimum this codebase applies elsewhere', () => {
  // Regression guard for the split above: the whole control used to measure
  // 21.5px, well under the minimum, on an app whose primary surface is a phone
  // (CLAUDE.md §2). jsdom does not lay out, so assert the class contract rather
  // than a computed height — apps/web/e2e/approval-transition-mobile.auth.spec.ts
  // measures the real geometry in a browser.
  render(<ToggleChip>DM</ToggleChip>);
  const btn = screen.getByRole('button');
  expect(btn.className).toContain('min-h-[44px]');
  expect(btn.firstElementChild?.className).toContain('rounded-pill');
});
