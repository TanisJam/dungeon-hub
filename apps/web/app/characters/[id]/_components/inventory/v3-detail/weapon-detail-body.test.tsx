/**
 * Tests for WeaponDetailBody + RollAttackStubButton.
 *
 * Reqs: WIWD-BODY-01 (spec #1070)
 * Design: DBE3, DBE4 (design #1071)
 *
 * PHB p.194 — attack roll formula; PHB p.149 — Weapons table.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeaponDetailBody } from './weapon-detail-body';
import type { WeaponDetailVariant } from '@/lib/sheet-types';

function makeWeapon(overrides: Partial<WeaponDetailVariant> = {}): WeaponDetailVariant {
  return {
    instanceId: 'abc-123',
    v3Type: 'weapon',
    displayName: 'Longsword',
    subtitle: 'M',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 3,
    costCp: 1500,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    attackBonus: 5,
    dmg1: '1d8',
    dmgType: 'Cortante',
    range: null,
    properties: [],
    magicBonus: 0,
    ...overrides,
  };
}

describe('WeaponDetailBody — WIWD-BODY-01', () => {
  it('renders the attack bonus in the CTA (PHB p.194)', () => {
    render(<WeaponDetailBody detail={makeWeapon({ attackBonus: 5 })} />);
    // RollAttackStubButton renders "Tirar ataque +5"
    expect(screen.getByText(/tirar ataque/i)).toBeTruthy();
    expect(screen.getByText(/\+5/)).toBeTruthy();
  });

  it('renders Daño / Tipo / Alcance facts grid (PHB p.149)', () => {
    render(
      <WeaponDetailBody
        detail={makeWeapon({ dmg1: '1d8', dmgType: 'Cortante', range: '20/60' })}
      />,
    );
    expect(screen.getByText('Daño')).toBeTruthy();
    expect(screen.getByText('1d8')).toBeTruthy();
    expect(screen.getByText('Cortante')).toBeTruthy();
    expect(screen.getByText(/20\/60/)).toBeTruthy();
  });

  it('renders properties section when properties are present (PHB p.147)', () => {
    render(
      <WeaponDetailBody
        detail={makeWeapon({ properties: ['finesse', 'ligera'] })}
      />,
    );
    // Properties joined with ·
    expect(screen.getByText(/finesse/i)).toBeTruthy();
    expect(screen.getByText(/ligera/i)).toBeTruthy();
  });

  it('does NOT render properties section when properties array is empty', () => {
    const { container } = render(<WeaponDetailBody detail={makeWeapon({ properties: [] })} />);
    // Only one facts grid should be present (the daño/tipo/alcance one), not the properties one
    const propHeading = Array.from(container.querySelectorAll('.k')).find(
      (el) => el.textContent === 'Propiedades',
    );
    expect(propHeading).toBeUndefined();
  });
});
