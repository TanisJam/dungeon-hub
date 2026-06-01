/**
 * Tests for VitalGrid — ficha-* class assertions + hpEditorSlot slot threading.
 *
 * T1: HP tile has class ficha-vital-hp.
 * T2: AC tile has class ficha-vital-ac.
 * T3: hpEditorSlot provided → slot renders inside HP tile.
 * T4: no hpEditorSlot → HP editor absent.
 *
 * NOTE: VitalGrid is now a pure presentational component — HP editor gating moved to
 * HpEditorSlot (client component) + DmAwareAffordances. VitalGrid accepts an
 * optional `hpEditorSlot` ReactNode rendered inside the HP cell. (FIX B)
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { VitalGrid } from './vital-grid';

const defaultProps = {
  hp: { current: 25, max: 32 },
  ac: 15,
  initiative: 2,
};

describe('VitalGrid', () => {
  it('T1: HP tile has class ficha-vital-hp', () => {
    const { container } = render(<VitalGrid {...defaultProps} />);
    const hpTile = container.querySelector('.ficha-vital-hp');
    expect(hpTile).toBeTruthy();
  });

  it('T2: AC tile has class ficha-vital-ac', () => {
    const { container } = render(<VitalGrid {...defaultProps} />);
    const acTile = container.querySelector('.ficha-vital-ac');
    expect(acTile).toBeTruthy();
  });

  it('T3: hpEditorSlot provided → slot renders inside HP tile', () => {
    render(
      <VitalGrid
        {...defaultProps}
        hpEditorSlot={<div data-testid="hp-section-editor" data-isdmhere="true" />}
      />,
    );
    const editor = screen.getByTestId('hp-section-editor');
    expect(editor).toBeTruthy();
    expect(editor.getAttribute('data-isdmhere')).toBe('true');
  });

  it('T4: no hpEditorSlot → HP editor absent', () => {
    render(<VitalGrid {...defaultProps} />);
    expect(screen.queryByTestId('hp-section-editor')).toBeNull();
  });

  it('T5: armorFormula renders without truncate class — readable at 375px (a11y mobile lock)', () => {
    const { container } = render(
      <VitalGrid {...defaultProps} armorFormula="Unarmored (base 10) + DEX +2" />,
    );
    // Formula span must be present and must NOT carry the truncate class
    // (which cuts off text at small viewports — Bug 3 regression lock).
    // The AC tile has two spans: the label ("Clase Armadura") and the value.
    // The formula is the LAST span inside .ficha-vital-ac.
    const acTile = container.querySelector('.ficha-vital-ac');
    expect(acTile).toBeTruthy();
    const allSpans = acTile!.querySelectorAll('span');
    const formulaSpan = Array.from(allSpans).find(
      (s) => s.textContent === 'Unarmored (base 10) + DEX +2',
    );
    expect(formulaSpan, 'armorFormula span not found in AC tile').toBeTruthy();
    expect(formulaSpan!.className).not.toContain('truncate');
  });
});
