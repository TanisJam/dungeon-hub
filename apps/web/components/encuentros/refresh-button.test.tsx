import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RefreshButton } from './refresh-button';

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe('RefreshButton', () => {
  beforeEach(() => {
    mockRefresh.mockClear();
  });

  // REQ-WCO-WEB-07: Actualizar button calls router.refresh() on click
  it('REQ-WCO-WEB-07: calls router.refresh() when clicked', () => {
    render(<RefreshButton />);
    const btn = screen.getByRole('button', { name: /actualizar/i });
    fireEvent.click(btn);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  // REQ-WCO-WEB-07: ≥44px touch target for mobile accessibility
  it('REQ-WCO-WEB-07: has min-h-[44px] touch target class', () => {
    render(<RefreshButton />);
    const btn = screen.getByRole('button', { name: /actualizar/i });
    expect(btn.className).toContain('min-h-[44px]');
  });

  // Label is "Actualizar"
  it('renders label "Actualizar"', () => {
    render(<RefreshButton />);
    expect(screen.getByText('Actualizar')).toBeTruthy();
  });
});
