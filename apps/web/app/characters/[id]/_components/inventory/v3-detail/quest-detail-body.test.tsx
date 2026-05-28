/**
 * Tests for QuestDetailBody — STRICT TDD (RED first).
 *
 * Reqs: WIQD-BODY-01 (spec #1077)
 * Design: DCE1 (RSC), DC4 (only via v3TypeOverride==='quest'), DC6 (stub CTAs)
 *
 * House rule §1.2: quest items are DM-assigned — no PHB cite.
 * ERC3: quest items require v3TypeOverride='quest'; without it, render as derived type.
 * ERC5: quest name ellipsis at 375px — handled via CSS (globals.css .qn).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestDetailBody } from './quest-detail-body';
import type { QuestDetailVariant } from '@/lib/sheet-types';

function makeQuest(overrides: Partial<QuestDetailVariant> = {}): QuestDetailVariant {
  return {
    instanceId: 'quest-1',
    v3Type: 'quest',
    displayName: 'Medallón del Traidor',
    subtitle: 'G',
    rarity: null,
    magicFlag: false,
    equipped: false,
    weightLb: 0,
    costCp: null,
    qty: 1,
    notes: '',
    historyHeadline: null,
    historyDetail: null,
    questName: 'El Sello Roto',
    stage: 'Etapa 1',
    visibleTo: 'el grupo',
    ...overrides,
  };
}

describe('QuestDetailBody — WIQD-BODY-01', () => {
  it('renders queststamp card with ⚿ glyph symbol (house rule §1.2)', () => {
    const { container } = render(<QuestDetailBody detail={makeQuest()} />);
    // Queststamp card with symbol
    const stamp = container.querySelector('.inventory-init-detail-queststamp');
    expect(stamp).toBeTruthy();
    const symbol = container.querySelector('.symbol');
    expect(symbol?.textContent).toContain('⚿');
  });

  it('renders questName, stage, and visibleTo from questMeta', () => {
    const { container } = render(
      <QuestDetailBody
        detail={makeQuest({ questName: 'El Sello Roto', stage: 'Entregado', visibleTo: 'el grupo' })}
      />,
    );
    expect(screen.getByText('El Sello Roto')).toBeTruthy();
    // Stage + visibleTo in .stg element
    const stg = container.querySelector('.stg');
    expect(stg?.textContent).toContain('Entregado');
    expect(stg?.textContent).toContain('el grupo');
  });

  it('renders two disabled CTA stubs: Ver quest + Mostrar al DM (DC6)', () => {
    render(<QuestDetailBody detail={makeQuest()} />);
    const btns = screen.getAllByRole('button');
    expect(btns.length).toBeGreaterThanOrEqual(2);
    btns.forEach((btn) => {
      expect(btn.hasAttribute('disabled')).toBe(true);
    });
    // Specific button labels
    expect(screen.getByRole('button', { name: /ver quest/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /mostrar al dm/i })).toBeTruthy();
  });

  it('renders default placeholder text when using default questMeta values', () => {
    render(
      <QuestDetailBody
        detail={makeQuest({ questName: 'Quest sin nombre', stage: 'Etapa 1', visibleTo: 'el grupo' })}
      />,
    );
    expect(screen.getByText('Quest sin nombre')).toBeTruthy();
  });
});
