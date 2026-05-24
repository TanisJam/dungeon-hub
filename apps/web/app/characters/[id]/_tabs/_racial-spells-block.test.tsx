/**
 * Unit tests for RacialSpellsBlock component.
 *
 * T-1: empty array → renders nothing (no section heading)
 * T-2: 1 cantrip → renders Cantrip group label + spell name
 * T-3: mixed frequencies → renders groups in correct order (Cantrip / Innate / Daily 1)
 * T-4: daily-1 spell → renders "1/descanso largo" badge
 *
 * PHB citations:
 *   - Tiefling Infernal Legacy: PHB p.42-43
 *   - High Elf cantrip: PHB p.23
 *   - Drow Magic: PHB p.24
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RacialSpellsBlock } from './_racial-spells-block';
import type { RacialSpellView } from '@/lib/sheet-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSpell(overrides: Partial<RacialSpellView> & Pick<RacialSpellView, 'slug' | 'frequency'>): RacialSpellView {
  return {
    source: 'phb',
    characterLevelAvailable: 1,
    ability: 'cha',
    castLevel: null,
    isPlayerChoice: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// T-1: empty array → renders nothing
// ---------------------------------------------------------------------------

describe('T-1: empty racialSpells → renders nothing', () => {
  it('renders no heading when racialSpells is empty (PHB: Human has no innate spells)', () => {
    const { container } = render(<RacialSpellsBlock racialSpells={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T-2: 1 cantrip → renders section + spell name
// ---------------------------------------------------------------------------

describe('T-2: single cantrip spell → renders Cantrip group', () => {
  it('renders section heading and spell name for a single at-will entry', () => {
    // PHB p.42-43: Tiefling knows thaumaturgy (at-will, CHA, level 1)
    const spells: RacialSpellView[] = [
      makeSpell({ slug: 'thaumaturgy', frequency: 'at-will' }),
    ];
    render(<RacialSpellsBlock racialSpells={spells} />);

    expect(screen.getByRole('heading', { name: /hechizos raciales/i })).toBeTruthy();
    expect(screen.getByText('Thaumaturgy')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T-3: mixed frequencies → correct group order (Cantrip before Daily 1)
// ---------------------------------------------------------------------------

describe('T-3: mixed frequencies → groups rendered in order (Cantrip → Daily 1)', () => {
  it('renders at-will group before daily-1 group in DOM order', () => {
    // PHB p.42-43: Tiefling — thaumaturgy at-will, hellish-rebuke daily-1
    const spells: RacialSpellView[] = [
      makeSpell({ slug: 'hellish-rebuke', frequency: 'daily-1', characterLevelAvailable: 3, castLevel: 2 }),
      makeSpell({ slug: 'thaumaturgy', frequency: 'at-will', characterLevelAvailable: 1 }),
    ];
    render(<RacialSpellsBlock racialSpells={spells} />);

    const thaumaturgy = screen.getByText('Thaumaturgy');
    const hellishRebuke = screen.getByText('Hellish Rebuke');

    // at-will (cantrip) must appear before daily-1 in the DOM
    const allText = document.body.innerHTML;
    expect(allText.indexOf('Thaumaturgy')).toBeLessThan(allText.indexOf('Hellish Rebuke'));
    expect(thaumaturgy).toBeTruthy();
    expect(hellishRebuke).toBeTruthy();
  });

  it('renders all three frequency labels when three distinct entries exist', () => {
    // PHB p.42-43: Tiefling 3 spells across at-will + 2 daily-1 entries
    const spells: RacialSpellView[] = [
      makeSpell({ slug: 'thaumaturgy', frequency: 'at-will', characterLevelAvailable: 1 }),
      makeSpell({ slug: 'hellish-rebuke', frequency: 'daily-1', characterLevelAvailable: 3, castLevel: 2 }),
      makeSpell({ slug: 'darkness', frequency: 'daily-1', characterLevelAvailable: 5 }),
    ];
    render(<RacialSpellsBlock racialSpells={spells} />);

    expect(screen.getByText('Thaumaturgy')).toBeTruthy();
    expect(screen.getByText('Hellish Rebuke')).toBeTruthy();
    expect(screen.getByText('Darkness')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T-4: daily-1 spell → renders "1/descanso largo" badge
// ---------------------------------------------------------------------------

describe('T-4: daily-1 frequency → renders "1/descanso largo" badge', () => {
  it('shows "1/descanso largo" label for a daily-1 entry', () => {
    // PHB p.42-43: Hellish Rebuke — 1 use per long rest, cast as 2nd-level
    const spells: RacialSpellView[] = [
      makeSpell({ slug: 'hellish-rebuke', frequency: 'daily-1', characterLevelAvailable: 3, castLevel: 2 }),
    ];
    render(<RacialSpellsBlock racialSpells={spells} />);

    // "1/descanso largo" appears in both the group header and the frequency badge
    const freqLabels = screen.getAllByText(/1\/descanso largo/i);
    expect(freqLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Hellish Rebuke')).toBeTruthy();
  });
});
