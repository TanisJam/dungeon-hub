/**
 * Component tests for AccountMenu — the TopBar right-cluster account menu
 * that fixes the audit's worst finding: /dashboard held the app's only
 * sign-out control, and /dashboard is unreachable from the shell nav.
 *
 * (a) trigger has an accessible name and opens the sheet on click (keyboard-
 *     operable via native <button>)
 * (b) all four destinations are exposed: Mis personajes, Mis campañas,
 *     Ajustes, and the sign-out control
 * (c) hrefs point at /personajes, /campanas, /settings
 */
import type React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

// SignOutButton depends on useRouter + the supabase browser client, neither
// of which is the focus of these AccountMenu tests.
vi.mock('@/app/_components/sign-out-button', () => ({
  SignOutButton: () => <button type="button">Cerrar sesión</button>,
}));

// V3Sheet — render children directly without the portal/focus machinery for test simplicity.
vi.mock('@/components/ui/sheet', () => ({
  V3Sheet: ({ open, onClose, children, title }: {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="v3-sheet">
        {title && <h2>{title}</h2>}
        <button type="button" data-testid="sheet-close" onClick={onClose}>Close</button>
        {children}
      </div>
    ) : null,
}));

import { AccountMenu } from './account-menu';

describe('AccountMenu', () => {
  it('(a) trigger has an accessible name and opens the sheet on click', async () => {
    render(<AccountMenu />);

    expect(screen.queryByTestId('v3-sheet')).toBeNull();

    const trigger = screen.getByRole('button', { name: 'Cuenta' });
    await act(async () => { fireEvent.click(trigger); });

    expect(screen.getByTestId('v3-sheet')).toBeTruthy();
  });

  it('(b) exposes all four destinations: Mis personajes, Mis campañas, Ajustes, sign-out', async () => {
    render(<AccountMenu />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cuenta' })); });

    expect(screen.getByRole('link', { name: /mis personajes/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /mis campañas/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ajustes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeTruthy();
  });

  it('(c) destination links point at /personajes, /campanas, /settings', async () => {
    render(<AccountMenu />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cuenta' })); });

    expect(screen.getByRole('link', { name: /mis personajes/i }).getAttribute('href')).toBe('/personajes');
    expect(screen.getByRole('link', { name: /mis campañas/i }).getAttribute('href')).toBe('/campanas');
    expect(screen.getByRole('link', { name: /ajustes/i }).getAttribute('href')).toBe('/settings');
  });
});
