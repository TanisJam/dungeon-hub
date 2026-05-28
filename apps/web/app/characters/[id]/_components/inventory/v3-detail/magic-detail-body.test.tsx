/**
 * Tests for MagicDetailBody — STRICT TDD (RED first).
 *
 * Reqs: WIMD-BODY-01 (spec #1077)
 * Design: DCE1 (RSC), DC6 (stub CTAs — no onClick), DC2 (no compute fn)
 *
 * PHB p.136-138: Magic Items — Attunement.
 * PHB p.138: "You can attune to it over a short rest."
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MagicDetailBody } from './magic-detail-body';
import type { MagicDetailVariant } from '@/lib/sheet-types';

function makeMagic(overrides: Partial<MagicDetailVariant> = {}): MagicDetailVariant {
  return {
    instanceId: 'magic-1',
    v3Type: 'magic',
    displayName: 'Ring of Protection',
    subtitle: 'RG',
    rarity: 'rare',
    magicFlag: true,
    equipped: false,
    weightLb: 0,
    costCp: null,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    attuneRequired: true,
    attuned: false,
    restAttuneNote: 'Requiere sintonización durante un descanso corto',
    powerName: null,
    powerDesc: '+1 bonus to AC and saving throws',
    charges: null,
    chargesMax: null,
    ...overrides,
  };
}

describe('MagicDetailBody — WIMD-BODY-01', () => {
  it('renders attune pip strip when attuneRequired=true and attuned=false (PHB p.138)', () => {
    // Given: a magic item that requires attunement but is not yet attuned
    const { container } = render(<MagicDetailBody detail={makeMagic({ attuneRequired: true, attuned: false })} />);
    // Then: attune strip with "Requiere sintonización" label is visible
    const attune = container.querySelector('.inventory-init-detail-attune');
    expect(attune).toBeTruthy();
    // The .lbl element has exactly "Requiere sintonización"
    const lbl = container.querySelector('.inventory-init-detail-attune .lbl');
    expect(lbl?.textContent).toBe('Requiere sintonización');
  });

  it('renders "Sintonizado" label when attuned=true (PHB p.138)', () => {
    // Given: a magic item that is currently attuned
    render(<MagicDetailBody detail={makeMagic({ attuneRequired: true, attuned: true })} />);
    // Then: "Sintonizado" label appears
    expect(screen.getByText(/sintonizado/i)).toBeTruthy();
  });

  it('does NOT render attune strip when attuneRequired=false (no attunement needed)', () => {
    render(<MagicDetailBody detail={makeMagic({ attuneRequired: false, attuned: false })} />);
    const attune = document.querySelector('.inventory-init-detail-attune');
    expect(attune).toBeNull();
  });

  it('renders charges counter when chargesMax is not null', () => {
    render(<MagicDetailBody detail={makeMagic({ charges: 3, chargesMax: 7 })} />);
    // Counter section should display charges info
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('"Activar poder" CTA is disabled (DC6 — RSC stub pattern per design #1078)', () => {
    render(<MagicDetailBody detail={makeMagic()} />);
    const btn = screen.getByRole('button', { name: /activar poder/i });
    expect(btn).toBeTruthy();
    // DCE1+DC6: NO onClick on RSC stub
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
