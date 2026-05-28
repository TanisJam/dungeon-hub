/**
 * Tests for ArmorDetailBody.
 *
 * Reqs: WIAD-BODY-01 (spec #1070)
 * Design: DBE3 (design #1071) — RSC body.
 *
 * PHB p.144-145 — Armor table (AC formula, Stealth disadvantage, STR min).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ArmorDetailBody } from './armor-detail-body';
import type { ArmorDetailVariant } from '@/lib/sheet-types';

function makeArmor(overrides: Partial<ArmorDetailVariant> = {}): ArmorDetailVariant {
  return {
    instanceId: 'abc-armor',
    v3Type: 'armor',
    displayName: 'Chain Shirt',
    subtitle: 'MA',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 20,
    costCp: 5000,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    acBase: 13,
    armorCategory: 'MA',
    dexCapNote: '+ DEX (máx +2)',
    stealth: false,
    donTime: '5 min',
    armorStrengthMin: 0,
    ...overrides,
  };
}

describe('ArmorDetailBody — WIAD-BODY-01', () => {
  it('renders CA base and dexCapNote (PHB p.145)', () => {
    render(<ArmorDetailBody detail={makeArmor({ acBase: 13, dexCapNote: '+ DEX (máx +2)' })} />);
    expect(screen.getByText('13')).toBeTruthy();
    expect(screen.getByText('+ DEX (máx +2)')).toBeTruthy();
  });

  it('renders "Desventaja" for Sigilo when stealth=true (PHB p.144)', () => {
    render(<ArmorDetailBody detail={makeArmor({ stealth: true })} />);
    expect(screen.getByText('Desventaja')).toBeTruthy();
  });

  it('renders STR rule when armorStrengthMin > 0 (PHB p.144)', () => {
    render(<ArmorDetailBody detail={makeArmor({ armorStrengthMin: 15 })} />);
    expect(screen.getByText('FUE requerida')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
  });

  it('does NOT render STR rule when armorStrengthMin === 0', () => {
    const { container } = render(<ArmorDetailBody detail={makeArmor({ armorStrengthMin: 0 })} />);
    const ruleEl = container.querySelector('.inventory-init-detail-rule');
    expect(ruleEl).toBeNull();
  });
});
