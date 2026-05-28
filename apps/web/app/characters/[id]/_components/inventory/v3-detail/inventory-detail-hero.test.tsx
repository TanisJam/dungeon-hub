/**
 * Tests for InventoryDetailHero — STRICT TDD (RED first).
 *
 * Reqs: WIDS-SHELL-01, WIE10-MIGRATE-01 (spec #1070)
 * Design: DBE1, DBE5 (design #1071)
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InventoryDetailHero } from './inventory-detail-hero';
import type { InventoryDetailResponse } from '@/lib/sheet-types';

// Mock actions (pulls in Supabase which needs env vars)
vi.mock('../../../actions', () => ({
  updateInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  removeInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  addInventoryItem: vi.fn().mockResolvedValue({ ok: true }),
  searchCompendiumItems: vi.fn().mockResolvedValue([]),
}));
vi.mock('../equip-toggle', () => ({
  EquipToggle: () => null,
}));
vi.mock('../delete-button', () => ({
  DeleteButton: () => null,
}));

function makeWeapon(overrides: Partial<InventoryDetailResponse> = {}): InventoryDetailResponse {
  return {
    instanceId: 'abc-123',
    v3Type: 'weapon',
    displayName: 'Espada larga',
    subtitle: null,
    rarity: 'rare',
    magicFlag: true,
    equipped: false,
    weightLb: 3,
    costCp: null,
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
  } as InventoryDetailResponse;
}

describe('InventoryDetailHero — WIDS-SHELL-01', () => {
  it('applies the weapon type tint class to the hero element', () => {
    const { container } = render(
      <InventoryDetailHero
        detail={makeWeapon({ v3Type: 'weapon' })}
        characterId="ch-1"
      />,
    );
    const hero = container.querySelector('.inventory-init-detail-hero');
    expect(hero).toBeTruthy();
    expect(hero!.classList.contains('weapon')).toBe(true);
  });

  it('renders rarity stamp with correct rarity class', () => {
    render(
      <InventoryDetailHero
        detail={makeWeapon({ rarity: 'rare' })}
        characterId="ch-1"
      />,
    );
    const stamp = document.querySelector('.rarity-stamp');
    expect(stamp).toBeTruthy();
    expect(stamp!.classList.contains('rarity-rare')).toBe(true);
  });

  it('equip chip shows aria-pressed=true when item is equipped', () => {
    render(
      <InventoryDetailHero
        detail={makeWeapon({ equipped: true })}
        characterId="ch-1"
      />,
    );
    // aria-label is "Desequipar ítem"; button text is "Equipado"
    const chip = screen.getByRole('button', { name: /desequipar/i });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('equip chip shows aria-pressed=false when item is not equipped', () => {
    render(
      <InventoryDetailHero
        detail={makeWeapon({ equipped: false })}
        characterId="ch-1"
      />,
    );
    // aria-label is "Equipar ítem"; button text is "Equipar"
    const chip = screen.getByRole('button', { name: /equipar ítem/i });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });
});

// ── Slice C: hero tint class assertions (T9) ──────────────────────────────────

import type {
  MagicDetailVariant,
  BookDetailVariant,
  TrinketDetailVariant,
  QuestDetailVariant,
} from '@/lib/sheet-types';

describe('InventoryDetailHero — Slice C hero tints (T9)', () => {
  it('applies "magic" tint class for v3Type==="magic"', () => {
    const detail: MagicDetailVariant = {
      ...makeWeapon(), v3Type: 'magic', attuneRequired: false, attuned: false,
      restAttuneNote: '', powerName: null, powerDesc: null, charges: null, chargesMax: null,
    };
    const { container } = render(<InventoryDetailHero detail={detail} characterId="ch-1" />);
    const hero = container.querySelector('.inventory-init-detail-hero');
    expect(hero?.classList.contains('magic')).toBe(true);
  });

  it('applies "book" tint class for v3Type==="book"', () => {
    const detail: BookDetailVariant = {
      ...makeWeapon(), v3Type: 'book', passage: '…', pagesRead: 0, pages: 100, language: 'Común', knowledge: [],
    };
    const { container } = render(<InventoryDetailHero detail={detail} characterId="ch-1" />);
    const hero = container.querySelector('.inventory-init-detail-hero');
    expect(hero?.classList.contains('book')).toBe(true);
  });

  it('applies "trinket" tint class for v3Type==="trinket"', () => {
    const detail: TrinketDetailVariant = {
      ...makeWeapon(), v3Type: 'trinket', narrative: null,
    };
    const { container } = render(<InventoryDetailHero detail={detail} characterId="ch-1" />);
    const hero = container.querySelector('.inventory-init-detail-hero');
    expect(hero?.classList.contains('trinket')).toBe(true);
  });

  it('applies "quest" tint class for v3Type==="quest"', () => {
    const detail: QuestDetailVariant = {
      ...makeWeapon(), v3Type: 'quest', questName: 'Test', stage: 'Etapa 1', visibleTo: 'el grupo',
    };
    const { container } = render(<InventoryDetailHero detail={detail} characterId="ch-1" />);
    const hero = container.querySelector('.inventory-init-detail-hero');
    expect(hero?.classList.contains('quest')).toBe(true);
  });
});
