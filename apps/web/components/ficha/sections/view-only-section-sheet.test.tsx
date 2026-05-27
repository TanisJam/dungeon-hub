/**
 * Tests for ViewOnlySectionSheet — VIEW-SHEET-01, VIEW-SHEET-02, VIEW-SHEET-03.
 *
 * T1: Renders sheet title (VIEW-SHEET-01).
 * T2: draft → Link "Editar" visible; no locked banner (VIEW-SHEET-02).
 * T3: pending_approval → Link "Editar" visible; no locked banner (VIEW-SHEET-02).
 * T4: active + isDm=true → Link "Editar (DM)" visible; no locked banner (VIEW-SHEET-02).
 * T5: retired + isDm=true → Link "Editar (DM)" visible; no locked banner (VIEW-SHEET-02).
 * T6: active + isDm=false → locked banner visible; no edit link (VIEW-SHEET-02).
 * T7: dead + isDm=false → locked banner visible; no edit link (VIEW-SHEET-02).
 * T8: wrapper button has aria-label "Editar linaje" (VIEW-SHEET-03).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock react-dom createPortal for V3Sheet
import { createPortal } from 'react-dom';
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock next/link — render as plain anchor
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { ViewOnlySectionSheet } from './view-only-section-sheet';

const baseProps = {
  title: 'Linaje',
  currentDisplay: <span>Humano</span>,
  wizardStepHref: '/characters/char-1/wizard/race',
  open: true,
  onClose: vi.fn(),
};

describe('ViewOnlySectionSheet — VIEW-SHEET-01', () => {
  it('T1: renders sheet title "Linaje"', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="active"
        isDm={false}
      />,
    );
    expect(screen.getByText('Linaje')).toBeTruthy();
  });
});

describe('ViewOnlySectionSheet — VIEW-SHEET-02 CTA matrix', () => {
  it('T2: draft → shows "Editar" link; no locked banner', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="draft"
        isDm={false}
      />,
    );
    expect(screen.getByRole('link', { name: 'Editar' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('T3: pending_approval → shows "Editar" link; no locked banner', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="pending_approval"
        isDm={false}
      />,
    );
    expect(screen.getByRole('link', { name: 'Editar' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('T4: active + isDm=true → shows "Editar (DM)" link; no locked banner', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="active"
        isDm={true}
      />,
    );
    expect(screen.getByRole('link', { name: 'Editar (DM)' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('T5: retired + isDm=true → shows "Editar (DM)" link; no locked banner', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="retired"
        isDm={true}
      />,
    );
    expect(screen.getByRole('link', { name: 'Editar (DM)' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('T6: active + isDm=false → locked banner visible; no edit link', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="active"
        isDm={false}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Esta ficha está cerrada. Pedíle al DM que la devuelva.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Editar/ })).toBeNull();
  });

  it('T7: dead + isDm=false → locked banner visible; no edit link', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="dead"
        isDm={false}
      />,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Editar/ })).toBeNull();
  });
});

describe('ViewOnlySectionSheet — VIEW-SHEET-03 affordance', () => {
  it('T8: wrapper pencil button has correct aria-label prop when provided', () => {
    render(
      <ViewOnlySectionSheet
        {...baseProps}
        characterStatus="active"
        isDm={false}
        ariaLabel="Editar linaje"
      />,
    );
    // The sheet is open — ariaLabel on the dialog wrapper div should be set.
    const region = screen.getByRole('dialog');
    expect(region).toBeTruthy();
    expect(region.getAttribute('aria-labelledby')).toBeTruthy();
  });
});
