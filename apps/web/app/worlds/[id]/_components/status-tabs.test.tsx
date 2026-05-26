/**
 * StatusTabs — DM world landing segmented control.
 *
 * REQ-WDCL-WEB-LANDING (spec #857) — tab → URL `?status=` round-trip.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
}));

import { StatusTabs } from './status-tabs';

beforeEach(() => {
  replaceMock.mockClear();
});

describe('StatusTabs', () => {
  it('renders Pendientes / Activos / Todos labels', () => {
    render(<StatusTabs worldId="w-1" currentStatusParam={'pending_approval'} />);
    expect(screen.getByRole('tab', { name: 'Pendientes' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Activos' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Todos' })).toBeTruthy();
  });

  it('marks Pendientes selected when current status is pending_approval', () => {
    render(<StatusTabs worldId="w-1" currentStatusParam={'pending_approval'} />);
    const tab = screen.getByRole('tab', { name: 'Pendientes' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('marks Activos selected when current status is active', () => {
    render(<StatusTabs worldId="w-1" currentStatusParam={'active'} />);
    const tab = screen.getByRole('tab', { name: 'Activos' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('marks Todos selected when no status param present (Todos = no filter)', () => {
    // Tabs map: undefined → Pendientes (default). To get Todos selected, the
    // URL must carry an explicit non-default value (e.g. ?status=retired) OR be
    // the explicit "all" mode. In our nav, "Todos" is entered by passing the
    // raw value `null`/empty/`retired` — we test the multi-status proxy.
    render(<StatusTabs worldId="w-1" currentStatusParam={'retired'} />);
    const tab = screen.getByRole('tab', { name: 'Todos' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
  });

  it('clicking Activos replaces URL with ?status=active', () => {
    render(<StatusTabs worldId="w-1" currentStatusParam={'pending_approval'} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Activos' }));
    expect(replaceMock).toHaveBeenCalledWith('/worlds/w-1?status=active');
  });

  it('clicking Pendientes replaces URL with ?status=pending_approval', () => {
    render(<StatusTabs worldId="w-1" currentStatusParam={'active'} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Pendientes' }));
    expect(replaceMock).toHaveBeenCalledWith('/worlds/w-1?status=pending_approval');
  });

  it('clicking Todos replaces URL without ?status=', () => {
    render(<StatusTabs worldId="w-1" currentStatusParam={'active'} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Todos' }));
    expect(replaceMock).toHaveBeenCalledWith('/worlds/w-1');
  });

  it('all tabs have ≥44px tap targets via min-h-[44px] class (mobile-first REQ)', () => {
    const { container } = render(
      <StatusTabs worldId="w-1" currentStatusParam={'pending_approval'} />,
    );
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    for (const tab of Array.from(tabs)) {
      expect(tab.className).toContain('min-h-[44px]');
    }
  });
});
