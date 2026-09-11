/**
 * AppChrome — mounts the persistent nav chrome once in the root layout
 * (audit F1, work unit 1). Covers the behaviour that used to live inside
 * AppShell (DesktopSidebar + TabBar rendering, gated on callerRole) before
 * it moved here — see app-shell-caller-role.test.tsx for what AppShell
 * itself still owns (canBeDM derivation only).
 */
import type React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const mockUsePathname = vi.fn(() => '/inicio');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { AppChrome } from './app-chrome';

describe('AppChrome — route classification (F1)', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/inicio');
  });

  it('standalone route (/) renders children with no nav chrome at all', () => {
    mockUsePathname.mockReturnValue('/');
    render(
      <AppChrome>
        <div data-testid="page-content">landing</div>
      </AppChrome>,
    );
    expect(screen.getByTestId('page-content')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it.each(['/auth/error', '/invite/abc', '/link/abc', '/dev/catalog/components'])(
    'standalone route %s renders children with no nav chrome',
    (pathname) => {
      mockUsePathname.mockReturnValue(pathname);
      render(
        <AppChrome>
          <div data-testid="page-content">content</div>
        </AppChrome>,
      );
      expect(screen.getByTestId('page-content')).toBeTruthy();
      expect(screen.queryByRole('navigation')).toBeNull();
    },
  );

  it('wizard route renders the desktop sidebar but NOT the mobile tabbar', () => {
    mockUsePathname.mockReturnValue('/characters/abc123/wizard/spells');
    render(
      <AppChrome>
        <div data-testid="page-content">wizard step</div>
      </AppChrome>,
    );
    expect(screen.getByTestId('page-content')).toBeTruthy();
    expect(screen.getByLabelText('Navegación de escritorio')).toBeTruthy();
    expect(screen.queryByLabelText('Navegación principal')).toBeNull();
  });

  it('level-up route renders the desktop sidebar but NOT the mobile tabbar', () => {
    mockUsePathname.mockReturnValue('/characters/abc123/level-up');
    render(
      <AppChrome>
        <div data-testid="page-content">level up</div>
      </AppChrome>,
    );
    expect(screen.getByLabelText('Navegación de escritorio')).toBeTruthy();
    expect(screen.queryByLabelText('Navegación principal')).toBeNull();
  });

  it('an ordinary authenticated route renders both the sidebar and the tabbar', () => {
    mockUsePathname.mockReturnValue('/inicio');
    render(
      <AppChrome>
        <div data-testid="page-content">home</div>
      </AppChrome>,
    );
    expect(screen.getByLabelText('Navegación de escritorio')).toBeTruthy();
    expect(screen.getByLabelText('Navegación principal')).toBeTruthy();
  });

  it('forwards callerRole="gm" to both nav components (Mesa destination appears)', () => {
    mockUsePathname.mockReturnValue('/inicio');
    render(
      <AppChrome callerRole="gm">
        <div>home</div>
      </AppChrome>,
    );
    const mesaLinks = screen.getAllByRole('link', { name: /mesa/i });
    // One in DesktopSidebar, one in TabBar.
    expect(mesaLinks).toHaveLength(2);
  });

  it('callerRole="player" (default-deny) hides the Mesa destination in both nav components', () => {
    mockUsePathname.mockReturnValue('/inicio');
    render(
      <AppChrome callerRole="player">
        <div>home</div>
      </AppChrome>,
    );
    expect(screen.queryByRole('link', { name: /mesa/i })).toBeNull();
  });
});
