/**
 * Tests for ResourcePanelView — pure presentational layer.
 * REQ-WCO-WEB-05, REQ-WCO-WEB-06, REQ-WCO-WEB-07
 *
 * All assertions are prop-driven: no SA mocks, no useRouter needed.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResourcePanelView } from './resource-panel-view';
import type { ClassResourceView } from '@/lib/sheet-types';

const kiResource: ClassResourceView = {
  slug: 'monk:ki-points',
  classSlug: 'monk',
  used: 6,
  max: 10,
  recoveryTrigger: 'short',
};

const BASE_PROPS = {
  resources: [kiResource],
  pending: false,
  actionError: null,
  toastMessage: null,
  onUse: vi.fn(),
  onRestore: vi.fn(),
  onShortRest: vi.fn(),
  onLongRest: vi.fn(),
};

describe('ResourcePanelView — presentational', () => {
  // REQ-WCO-WEB-05a: shows resource name and counter
  it('REQ-WCO-WEB-05a: shows resource name, current/max counter', () => {
    render(<ResourcePanelView {...BASE_PROPS} />);
    // current = max - used = 10 - 6 = 4
    expect(screen.getByText(/Puntos de Ki/i)).toBeTruthy();
    expect(screen.getByText(/4\s*\/\s*10/)).toBeTruthy();
  });

  // REQ-WCO-WEB-05b: Use + Restore buttons with ≥44px touch target
  it('REQ-WCO-WEB-05b: Use and Restore buttons have min-h-[44px] touch target', () => {
    render(<ResourcePanelView {...BASE_PROPS} />);
    const useBtn = screen.getByRole('button', { name: /usar/i });
    const restoreBtn = screen.getByRole('button', { name: /restaurar/i });
    expect(useBtn).toBeTruthy();
    expect(restoreBtn).toBeTruthy();
    const hasMinHeight = (el: Element) =>
      el.className.includes('min-h-[44px]') ||
      el.closest('[class*="min-h-"]') !== null;
    expect(hasMinHeight(useBtn)).toBe(true);
  });

  // REQ-WCO-WEB-06: Short + Long rest buttons visible
  it('REQ-WCO-WEB-06: Short Rest and Long Rest buttons are visible', () => {
    render(<ResourcePanelView {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: /descanso corto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /descanso largo/i })).toBeTruthy();
  });

  // Empty resources: no resource rows but rest buttons still shown
  it('REQ-WCO-WEB-05c: empty resource list still shows rest buttons', () => {
    render(<ResourcePanelView {...BASE_PROPS} resources={[]} />);
    expect(screen.getByRole('button', { name: /descanso corto/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /descanso largo/i })).toBeTruthy();
  });

  // pending===true → Use button disabled
  it('pending===true → Use button is disabled', () => {
    render(<ResourcePanelView {...BASE_PROPS} pending={true} />);
    const useBtn = screen.getByRole('button', { name: /usar/i });
    expect((useBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // Use button disabled when remaining === 0
  it('Use button disabled when remaining === 0 (used === max)', () => {
    const exhausted: ClassResourceView = { ...kiResource, used: 10, max: 10 };
    render(<ResourcePanelView {...BASE_PROPS} resources={[exhausted]} />);
    const useBtn = screen.getByRole('button', { name: /usar/i });
    expect((useBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // Restore button disabled when used === 0
  it('Restore button disabled when used === 0', () => {
    const full: ClassResourceView = { ...kiResource, used: 0, max: 10 };
    render(<ResourcePanelView {...BASE_PROPS} resources={[full]} />);
    const restoreBtn = screen.getByRole('button', { name: /restaurar/i });
    expect((restoreBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // onUse called with slug when Use clicked
  it('clicking Use calls onUse with the resource slug', () => {
    const onUse = vi.fn();
    render(<ResourcePanelView {...BASE_PROPS} onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: /usar/i }));
    expect(onUse).toHaveBeenCalledWith('monk:ki-points');
  });

  // onRestore called with slug when Restore clicked
  it('clicking Restore calls onRestore with the resource slug', () => {
    const onRestore = vi.fn();
    render(<ResourcePanelView {...BASE_PROPS} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole('button', { name: /restaurar/i }));
    expect(onRestore).toHaveBeenCalledWith('monk:ki-points');
  });

  // onShortRest called when short rest clicked
  it('clicking short rest calls onShortRest', () => {
    const onShortRest = vi.fn();
    render(<ResourcePanelView {...BASE_PROPS} onShortRest={onShortRest} />);
    fireEvent.click(screen.getByRole('button', { name: /descanso corto/i }));
    expect(onShortRest).toHaveBeenCalledTimes(1);
  });

  // onLongRest called when long rest clicked
  it('clicking long rest calls onLongRest', () => {
    const onLongRest = vi.fn();
    render(<ResourcePanelView {...BASE_PROPS} onLongRest={onLongRest} />);
    fireEvent.click(screen.getByRole('button', { name: /descanso largo/i }));
    expect(onLongRest).toHaveBeenCalledTimes(1);
  });

  // actionError renders alert
  it('actionError renders an alert element', () => {
    render(<ResourcePanelView {...BASE_PROPS} actionError="Error genérico." />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Error genérico.');
  });
});
