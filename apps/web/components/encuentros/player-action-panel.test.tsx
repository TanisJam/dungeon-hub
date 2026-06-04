/**
 * Tests for PlayerActionPanel layout shell — REQ-WCPT-WEB-UI-01.
 *
 * PlayerActionPanel is a pure LAYOUT shell. It renders children inside
 * a <section aria-label="Acciones"> with a flex-col stack.
 * No action logic — just composition scaffold for C2/C3/C4.
 *
 * ADR-3: panel = thin layout shell; each action is its OWN island passed as children.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerActionPanel } from './player-action-panel';

describe('PlayerActionPanel — REQ-WCPT-WEB-UI-01', () => {
  // (a) Renders children inside <section aria-label="Acciones">
  it('(a) renders children inside section[aria-label="Acciones"]', () => {
    render(
      <PlayerActionPanel>
        <button type="button">Test Action</button>
      </PlayerActionPanel>,
    );

    const section = screen.getByRole('region', { name: /acciones/i });
    expect(section).toBeTruthy();
    expect(screen.getByRole('button', { name: /test action/i })).toBeTruthy();
  });

  // (b) Multiple children render correctly (composition for C2/C3/C4)
  it('(b) renders multiple children inside the panel', () => {
    render(
      <PlayerActionPanel>
        <button type="button">Action A</button>
        <button type="button">Action B</button>
      </PlayerActionPanel>,
    );

    expect(screen.getByRole('button', { name: /action a/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /action b/i })).toBeTruthy();
  });

  // (c) Section has flex flex-col gap-2 inner div (layout structure)
  it('(c) inner div has flex layout classes', () => {
    const { container } = render(
      <PlayerActionPanel>
        <span>child</span>
      </PlayerActionPanel>,
    );

    const inner = container.querySelector('div');
    expect(inner).toBeTruthy();
    expect(inner!.className).toContain('flex');
    expect(inner!.className).toContain('flex-col');
  });
});
