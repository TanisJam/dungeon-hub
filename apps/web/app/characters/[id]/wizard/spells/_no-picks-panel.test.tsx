/**
 * Unit tests: NoPicksPanel
 *
 * Tests:
 * - T-1: too-early variant → shows class message
 * - T-2: non-caster variant → shows non-caster message
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./actions', () => ({
  skipSpells: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/characters/test-id/wizard/spells',
}));

import { NoPicksPanel } from './_no-picks-panel';

const TOO_EARLY_MSG = 'Tu clase aprende hechizos al subir de nivel. No hay nada que elegir ahora.';
const NON_CASTER_MSG = 'Tu clase no utiliza hechizos.';

describe('NoPicksPanel', () => {
  it('T-1: too-early variant → shows class message', () => {
    render(
      <NoPicksPanel
        characterId="char-1"
        variant="too-early"
        className="paladin"
        level={1}
      />,
    );

    expect(screen.getByText(TOO_EARLY_MSG)).toBeTruthy();
  });

  it('T-2: non-caster variant → shows non-caster message', () => {
    render(
      <NoPicksPanel
        characterId="char-1"
        variant="non-caster"
        className="fighter"
        level={1}
      />,
    );

    expect(screen.getByText(NON_CASTER_MSG)).toBeTruthy();
  });
});
