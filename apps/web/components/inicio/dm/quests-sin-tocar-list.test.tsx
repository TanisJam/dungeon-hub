/**
 * Tests for QuestsSinTocarList component
 *
 * REQ-IDM-QUESTS-LIST-06: section heading, N rows with title + lastChange, icon-cell present
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QuestsSinTocarList } from './quests-sin-tocar-list';
import { MOCK_QUESTS_SIN_TOCAR } from '../dm-mock-data';

describe('QuestsSinTocarList', () => {
  it('T1: renders "Quests sin tocar" heading and correct row count', () => {
    const { container } = render(<QuestsSinTocarList quests={MOCK_QUESTS_SIN_TOCAR} />);
    // MOCK_QUESTS_SIN_TOCAR has 2 quests
    expect(container.textContent).toContain('Quests sin tocar');
    expect(container.querySelectorAll('[data-quest-row]').length).toBe(2);
  });

  it('T2: each row shows its title and "Último cambio: {lastChange}" text', () => {
    const { container } = render(<QuestsSinTocarList quests={MOCK_QUESTS_SIN_TOCAR} />);
    expect(container.textContent).toContain('El correo perdido');
    expect(container.textContent).toContain('Último cambio: hace 3 días');
    expect(container.textContent).toContain('La torre del pacto');
    expect(container.textContent).toContain('Último cambio: hace 5 días');
  });

  it('T3: at least one element with class inicio-row-quest-ic is present', () => {
    const { container } = render(<QuestsSinTocarList quests={MOCK_QUESTS_SIN_TOCAR} />);
    expect(container.querySelector('.inicio-row-quest-ic')).toBeTruthy();
  });

  it('T4 (edge): empty array renders heading but zero quest rows', () => {
    const { container } = render(<QuestsSinTocarList quests={[]} />);
    expect(container.textContent).toContain('Quests sin tocar');
    expect(container.querySelectorAll('[data-quest-row]').length).toBe(0);
  });
});
