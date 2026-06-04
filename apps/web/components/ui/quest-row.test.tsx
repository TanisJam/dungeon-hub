/**
 * Tests for QuestRow atom.
 *
 * T1: renders title text
 * T2: renders subtitle text (lastChange)
 * T3: icon cell (inicio-row-quest-ic class) is present
 * T4: chevron (›) is present
 * T5: root has rounded-xl bg-surface-raised (card-row style)
 * T6: root has data-quest-row attribute (for test targeting by parent tests)
 * T7: long title — title element has truncate class
 * T8: passes className to root element
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestRow } from './quest-row';

describe('QuestRow', () => {
  it('T1: renders title text', () => {
    render(<QuestRow title="El correo perdido" subtitle="Último cambio: hace 3 días" />);
    expect(screen.getByText('El correo perdido')).toBeTruthy();
  });

  it('T2: renders subtitle text', () => {
    render(<QuestRow title="La torre del pacto" subtitle="Último cambio: hace 5 días" />);
    expect(screen.getByText('Último cambio: hace 5 días')).toBeTruthy();
  });

  it('T3: icon cell with inicio-row-quest-ic class is present', () => {
    const { container } = render(<QuestRow title="Quest" subtitle="sub" />);
    expect(container.querySelector('.inicio-row-quest-ic')).toBeTruthy();
  });

  it('T4: chevron › is present', () => {
    render(<QuestRow title="Quest" subtitle="sub" />);
    expect(screen.getByText('›')).toBeTruthy();
  });

  it('T5: root has rounded-xl bg-surface-raised classes (card-row style)', () => {
    const { container } = render(<QuestRow title="Quest" subtitle="sub" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('rounded-xl');
    expect(root.className).toContain('bg-surface-raised');
  });

  it('T6: root has data-quest-row attribute', () => {
    const { container } = render(<QuestRow title="Quest" subtitle="sub" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.questRow).toBeDefined();
  });

  it('T7: title element has truncate class', () => {
    const { container } = render(<QuestRow title="A very long quest name that should truncate" subtitle="sub" />);
    const titleEl = container.querySelector('[data-quest-title]') as HTMLElement;
    expect(titleEl.className).toContain('truncate');
  });

  it('T8: passes className to root element', () => {
    const { container } = render(<QuestRow title="Quest" subtitle="sub" className="mt-2" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('mt-2');
  });
});
