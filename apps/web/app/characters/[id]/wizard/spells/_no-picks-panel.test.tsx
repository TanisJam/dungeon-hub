/**
 * Unit tests: NoPicksPanel
 *
 * Tests:
 * - T-1: too-early variant without hasRaceCantrip → shows class message, NO racial notice
 * - T-2: too-early variant with hasRaceCantrip → shows class message PLUS racial notice
 * - T-3: non-caster variant with hasRaceCantrip → shows non-caster message PLUS racial notice
 * - T-4: non-caster variant without hasRaceCantrip → shows only non-caster message
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

const RACIAL_NOTICE = 'Tu cantrip racial está configurado en el paso de raza.';
const TOO_EARLY_MSG = 'Tu clase aprende hechizos al subir de nivel. No hay nada que elegir ahora.';
const NON_CASTER_MSG = 'Tu clase no utiliza hechizos.';

describe('NoPicksPanel', () => {
  it('T-1: too-early without hasRaceCantrip → class message only, no racial notice', () => {
    render(
      <NoPicksPanel
        characterId="char-1"
        variant="too-early"
        className="paladin"
        level={1}
      />,
    );

    expect(screen.getByText(TOO_EARLY_MSG)).toBeTruthy();
    expect(screen.queryByText(RACIAL_NOTICE)).toBeNull();
  });

  it('T-2: too-early with hasRaceCantrip → class message AND racial notice', () => {
    render(
      <NoPicksPanel
        characterId="char-1"
        variant="too-early"
        className="paladin"
        level={1}
        hasRaceCantrip
      />,
    );

    expect(screen.getByText(TOO_EARLY_MSG)).toBeTruthy();
    expect(screen.getByText(RACIAL_NOTICE)).toBeTruthy();
  });

  it('T-3: non-caster with hasRaceCantrip → non-caster message AND racial notice', () => {
    render(
      <NoPicksPanel
        characterId="char-1"
        variant="non-caster"
        className="fighter"
        level={1}
        hasRaceCantrip
      />,
    );

    expect(screen.getByText(NON_CASTER_MSG)).toBeTruthy();
    expect(screen.getByText(RACIAL_NOTICE)).toBeTruthy();
  });

  it('T-4: non-caster without hasRaceCantrip → non-caster message only', () => {
    render(
      <NoPicksPanel
        characterId="char-1"
        variant="non-caster"
        className="fighter"
        level={1}
      />,
    );

    expect(screen.getByText(NON_CASTER_MSG)).toBeTruthy();
    expect(screen.queryByText(RACIAL_NOTICE)).toBeNull();
  });
});
