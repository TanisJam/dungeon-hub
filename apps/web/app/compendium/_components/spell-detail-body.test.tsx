import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SpellDetailBody } from './spell-detail-body';
import type { SpellDetail } from './types';

// PHB 2014 p.241 — Fireball: Level 3, Evocation, 1 action, 150 ft, V/S/M, instantaneous, 8d6 fire
const FIREBALL_FIXTURE: SpellDetail = {
  level: 3,
  eyebrow: 'Hechizo · Nivel 3',
  name: 'Fireball',
  school: 'Evocación',
  meta: [
    { k: 'Tiempo',      v: '1 acción'    },
    { k: 'Rango',       v: '150 pies'    },
    { k: 'Componentes', v: 'V, S, M'     },
    { k: 'Duración',    v: 'Instantánea' },
  ],
  paragraphs: [
    'Un brillante rayo de ámbar sale de tu dedo apuntado hacia un punto que elijas dentro del alcance.',
  ],
};

describe('SpellDetailBody', () => {
  it('WCDS-FIREBALL-01: lvl-stamp shows "3"', () => {
    const { container } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball is Level 3
    const stamp = container.querySelector('.lvl-stamp');
    expect(stamp?.textContent).toBe('3');
  });

  it('WCDS-FIREBALL-01: spell name renders "Fireball"', () => {
    const { getByText } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball
    expect(getByText('Fireball')).toBeTruthy();
  });

  it('WCDS-FIREBALL-01: school renders "Evocación"', () => {
    const { getByText } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Evocation
    expect(getByText('Evocación')).toBeTruthy();
  });

  it('WCDS-FIREBALL-01: meta row Tiempo / 1 acción', () => {
    const { getByText } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball: casting time 1 action
    expect(getByText('Tiempo')).toBeTruthy();
    expect(getByText('1 acción')).toBeTruthy();
  });

  it('WCDS-FIREBALL-01: meta row Rango / 150 pies', () => {
    const { getByText } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball: range 150 feet
    expect(getByText('Rango')).toBeTruthy();
    expect(getByText('150 pies')).toBeTruthy();
  });

  it('WCDS-FIREBALL-01: meta row Componentes / V, S, M', () => {
    const { getByText } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball: components V, S, M (tiny ball of bat guano + sulfur)
    expect(getByText('Componentes')).toBeTruthy();
    expect(getByText('V, S, M')).toBeTruthy();
  });

  it('WCDS-FIREBALL-01: meta row Duración / Instantánea', () => {
    const { getByText } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball: duration instantaneous
    expect(getByText('Duración')).toBeTruthy();
    expect(getByText('Instantánea')).toBeTruthy();
  });

  it('WCDS-FIREBALL-01 / WCDS-CTA-04: description paragraphs present and ghost buttons render', () => {
    const { container, getByText } = render(<SpellDetailBody spell={FIREBALL_FIXTURE} />);
    // PHB 2014 p.241 — Fireball: at least 1 description paragraph
    const paragraphs = container.querySelectorAll('.desc p');
    expect(paragraphs.length).toBeGreaterThanOrEqual(1);
    // WCDS-CTA-04: ghost button stubs
    expect(getByText('Preparar')).toBeTruthy();
    expect(getByText('Favorito')).toBeTruthy();
  });
});
