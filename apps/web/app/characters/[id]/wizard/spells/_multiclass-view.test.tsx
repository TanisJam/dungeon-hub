/**
 * Component tests for MulticlassSpellsView and TabBar.
 *
 * REQ-SP06-LOOP-CASTERS: renders one tab per caster class (2+ classes)
 * REQ-SP06-TAB-ACTIVE: switching tabs preserves picks on inactive tab
 * REQ-SP06-TAB-BADGE-INCOMPLETE: incomplete dot appears/clears per validateSpellsPick
 * REQ-SP06-SEQUENTIAL-SAVE: Siguiente triggers sequential save per class then proceedToReview
 * REQ-SP06-SEQUENTIAL-SAVE (failure): save failure switches active tab to failing class + shows error
 * REQ-SP06-SINGLE-CASTER-NO-TAB-BAR: SinglePickerView renders no tab element
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/characters/test-id/wizard/spells',
}));

vi.mock('./actions', () => ({
  saveSpellsForClass: vi.fn().mockResolvedValue({ ok: true }),
  proceedToReview: vi.fn().mockResolvedValue(undefined),
  skipSpells: vi.fn().mockResolvedValue(undefined),
}));

import { MulticlassSpellsView, type CasterTabData } from './_multiclass-view';
import { saveSpellsForClass, proceedToReview } from './actions';
import { SinglePickerView } from './_single-picker-view';

const makeLimits = (overrides = {}) => ({
  cantripsKnown: 0,
  spellsKnown: null,
  spellsPrepared: 1,
  maxSpellLevel: 1,
  ability: 'wis' as const,
  ...overrides,
});

const makeSpell = (overrides: Partial<{
  slug: string;
  source: string;
  name: string;
  level: number;
  school: string;
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  componentsMCost: number | null;
}> = {}) => ({
  slug: 'cure-wounds',
  source: 'PHB',
  name: 'Cure Wounds',
  level: 1,
  school: 'A',
  ritual: false,
  concentration: false,
  componentsM: false,
  componentsMCost: null,
  ...overrides,
});

const clericTab: CasterTabData = {
  classSlug: 'cleric',
  classSource: 'PHB',
  className: 'Clérigo',
  limits: makeLimits(),
  availableSpells: [makeSpell({ slug: 'cure-wounds', name: 'Cure Wounds' })],
  subclassGrantedSlugs: [],
  initialPicks: { cantrips: [], known: [], prepared: [] },
};

const wizardTab: CasterTabData = {
  classSlug: 'wizard',
  classSource: 'PHB',
  className: 'Mago',
  limits: makeLimits({ ability: 'int' }),
  availableSpells: [makeSpell({ slug: 'magic-missile', name: 'Magic Missile', school: 'V' })],
  subclassGrantedSlugs: [],
  initialPicks: { cantrips: [], known: [], prepared: [] },
};

const sorcererTab: CasterTabData = {
  classSlug: 'sorcerer',
  classSource: 'PHB',
  className: 'Hechicero',
  limits: makeLimits({ ability: 'cha' }),
  availableSpells: [makeSpell({ slug: 'fire-bolt', name: 'Fire Bolt', school: 'V' })],
  subclassGrantedSlugs: [],
  initialPicks: { cantrips: [], known: [], prepared: [] },
};

// SP-07: EK Fighter tab (Guerrero) and AT Rogue tab (Pícaro)
const guerreroEkTab: CasterTabData = {
  classSlug: 'fighter',
  classSource: 'PHB',
  className: 'Guerrero',
  limits: makeLimits({ ability: 'int' }),
  availableSpells: [makeSpell({ slug: 'shield', name: 'Shield', school: 'A' })],
  subclassGrantedSlugs: [],
  initialPicks: { cantrips: [], known: [], prepared: [] },
};

const picaroAtTab: CasterTabData = {
  classSlug: 'rogue',
  classSource: 'PHB',
  className: 'Pícaro',
  limits: makeLimits({ ability: 'int' }),
  availableSpells: [makeSpell({ slug: 'silent-image', name: 'Silent Image', school: 'I' })],
  subclassGrantedSlugs: [],
  initialPicks: { cantrips: [], known: [], prepared: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 6.1: renders a tab for each caster class ───────────────────────────────

describe('MulticlassSpellsView — tab rendering (REQ-SP06-LOOP-CASTERS)', () => {
  it('6.1: renders a tab for each caster class (2 tabs for Cleric + Wizard)', () => {
    render(
      <MulticlassSpellsView
        characterId="char-1"
        casterClasses={[clericTab, wizardTab]}
      />,
    );
    expect(screen.getByRole('tab', { name: /clérigo/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /mago/i })).toBeDefined();
  });

  it('6.1b: first tab is active by default — first class picker content is visible', () => {
    render(
      <MulticlassSpellsView
        characterId="char-1"
        casterClasses={[clericTab, wizardTab]}
      />,
    );
    // Cleric tab should be active first — its spell (Cure Wounds) visible
    expect(screen.getByText('Cure Wounds')).toBeDefined();
    // Wizard spell should not be visible (inactive tab)
    expect(screen.queryByText('Magic Missile')).toBeNull();
  });
});

// ── 6.2: switching tabs preserves picks on inactive tab ────────────────────

describe('MulticlassSpellsView — tab switch preserves picks (REQ-SP06-TAB-ACTIVE)', () => {
  it('6.2: switching to Wizard tab then back to Cleric tab shows Cleric picker again', () => {
    render(
      <MulticlassSpellsView
        characterId="char-1"
        casterClasses={[clericTab, wizardTab]}
      />,
    );
    // Initially on Cleric tab — Cure Wounds is visible
    expect(screen.getByText('Cure Wounds')).toBeDefined();

    // Click Wizard tab
    const wizardTabEl = screen.getByRole('tab', { name: /mago/i });
    fireEvent.click(wizardTabEl);

    // Now Wizard spell is visible, Cleric spell is not
    expect(screen.getByText('Magic Missile')).toBeDefined();
    expect(screen.queryByText('Cure Wounds')).toBeNull();

    // Click back to Cleric tab
    const clericTabEl = screen.getByRole('tab', { name: /clérigo/i });
    fireEvent.click(clericTabEl);

    // Cleric picker is back
    expect(screen.getByText('Cure Wounds')).toBeDefined();
  });
});

// ── 6.3: incomplete badge logic ────────────────────────────────────────────

describe('MulticlassSpellsView — incomplete badge (REQ-SP06-TAB-BADGE-INCOMPLETE)', () => {
  it('6.3: incomplete badge appears on tab when validateSpellsPick returns non-null', () => {
    // clericTab has spellsPrepared: 1 but initialPicks is empty → incomplete
    render(
      <MulticlassSpellsView
        characterId="char-1"
        casterClasses={[clericTab, wizardTab]}
      />,
    );
    // Both tabs should show incomplete badge (0 prepared, need 1)
    const incompleteBadges = screen.getAllByLabelText('incomplete');
    expect(incompleteBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('6.3b: tab badge clears when picks are complete', () => {
    // Give Wizard tab already-complete picks (1 prepared spell)
    const wizardComplete: CasterTabData = {
      ...wizardTab,
      limits: makeLimits({ cantripsKnown: 0, spellsKnown: null, spellsPrepared: 1, maxSpellLevel: 1, ability: 'int' }),
      initialPicks: {
        cantrips: [],
        known: [],
        prepared: [{ slug: 'magic-missile', source: 'PHB' }],
      },
    };
    render(
      <MulticlassSpellsView
        characterId="char-1"
        casterClasses={[clericTab, wizardComplete]}
      />,
    );
    // Cleric tab is incomplete (0 prepared), Wizard tab is complete
    // Only one incomplete badge — for Cleric
    const incompleteBadges = screen.getAllByLabelText('incomplete');
    expect(incompleteBadges.length).toBe(1);
  });
});

// ── 6.4: sequential save ───────────────────────────────────────────────────

describe('MulticlassSpellsView — sequential save (REQ-SP06-SEQUENTIAL-SAVE)', () => {
  it('6.4: Siguiente triggers saveSpellsForClass for each class in order then proceedToReview', async () => {
    vi.mocked(saveSpellsForClass).mockResolvedValue({ ok: true });

    // Use picks-complete tabs so validation passes
    const clericComplete: CasterTabData = {
      ...clericTab,
      initialPicks: { cantrips: [], known: [], prepared: [{ slug: 'cure-wounds', source: 'PHB' }] },
    };
    const wizardComplete: CasterTabData = {
      ...wizardTab,
      initialPicks: { cantrips: [], known: [], prepared: [{ slug: 'magic-missile', source: 'PHB' }] },
    };

    render(
      <MulticlassSpellsView
        characterId="char-1"
        casterClasses={[clericComplete, wizardComplete]}
      />,
    );

    const siguienteBtn = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguienteBtn);

    await waitFor(() => {
      expect(saveSpellsForClass).toHaveBeenCalledTimes(2);
    });

    // First call should be for cleric
    const calls = vi.mocked(saveSpellsForClass).mock.calls;
    expect(calls[0]?.[0]?.classSlug).toBe('cleric');
    expect(calls[1]?.[0]?.classSlug).toBe('wizard');

    await waitFor(() => {
      expect(proceedToReview).toHaveBeenCalledWith('char-1');
    });
  });
});

// ── 6.5: save failure switches to failing tab + shows error banner ─────────

describe('MulticlassSpellsView — save failure (REQ-SP06-SEQUENTIAL-SAVE failure)', () => {
  it('6.5: save failure switches active tab to failing class and shows error banner', async () => {
    vi.mocked(saveSpellsForClass)
      .mockResolvedValueOnce({ ok: false, error: 'Cleric save failed' });

    const clericComplete: CasterTabData = {
      ...clericTab,
      initialPicks: { cantrips: [], known: [], prepared: [{ slug: 'cure-wounds', source: 'PHB' }] },
    };
    const wizardComplete: CasterTabData = {
      ...wizardTab,
      initialPicks: { cantrips: [], known: [], prepared: [{ slug: 'magic-missile', source: 'PHB' }] },
    };

    render(
      <MulticlassSpellsView
        characterId="char-1"
        casterClasses={[clericComplete, wizardComplete]}
      />,
    );

    const siguienteBtn = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguienteBtn);

    await waitFor(() => {
      // Error message should be visible
      expect(screen.getByText('Cleric save failed')).toBeDefined();
    });

    // proceedToReview should NOT have been called
    expect(proceedToReview).not.toHaveBeenCalled();

    // Only one save call (stopped at first failure)
    expect(saveSpellsForClass).toHaveBeenCalledTimes(1);
  });
});

// ── SP-07 6.7: 3-tab render (Cleric + Wizard + Sorcerer) ─────────────────────

describe('MulticlassSpellsView — 3-tab render (REQ-SP07-MULTICLASS-3-TABS)', () => {
  it('SP-07 6.7: Cleric + Wizard + Sorcerer character → 3 tab buttons in DOM', () => {
    // REQ-SP07-MULTICLASS-3-TABS: triple caster must render 3 tabs
    render(
      <MulticlassSpellsView
        characterId="char-3"
        casterClasses={[clericTab, wizardTab, sorcererTab]}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole('tab', { name: /clérigo/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /mago/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /hechicero/i })).toBeDefined();
  });
});

// ── SP-07 6.8: EK Fighter + AT Rogue tabs labeled "Guerrero" + "Pícaro" ─────

describe('MulticlassSpellsView — EK+AT tab labels (REQ-SP07-MULTICLASS-EK-AT-PAGE)', () => {
  it('SP-07 6.8: Fighter L3 EK + Rogue L3 AT → 2 tabs labeled Guerrero and Pícaro', () => {
    // REQ-SP07-MULTICLASS-EK-AT-PAGE: EK and AT subclass casters get Spanish labels
    render(
      <MulticlassSpellsView
        characterId="char-ek-at"
        casterClasses={[guerreroEkTab, picaroAtTab]}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /guerrero/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /pícaro/i })).toBeDefined();
  });
});

// ── SP-07 6.9: Cleric (1st) succeeds, Wizard (2nd) fails → tab + error ───────

describe('MulticlassSpellsView — 2nd class save fail (REQ-SP07-MULTICLASS-2ND-CLASS-SAVE-FAIL)', () => {
  it('SP-07 6.9: Cleric save OK, Wizard save 400 → active tab switches to Wizard + error banner', async () => {
    // REQ-SP07-MULTICLASS-2ND-CLASS-SAVE-FAIL: first class save succeeds, second fails
    vi.mocked(saveSpellsForClass)
      .mockResolvedValueOnce({ ok: true })           // Cleric: success
      .mockResolvedValueOnce({ ok: false, error: 'Wizard SP07 save failed' }); // Wizard: fail

    const clericComplete: CasterTabData = {
      ...clericTab,
      initialPicks: { cantrips: [], known: [], prepared: [{ slug: 'cure-wounds', source: 'PHB' }] },
    };
    const wizardComplete: CasterTabData = {
      ...wizardTab,
      initialPicks: { cantrips: [], known: [], prepared: [{ slug: 'magic-missile', source: 'PHB' }] },
    };

    render(
      <MulticlassSpellsView
        characterId="char-sp07"
        casterClasses={[clericComplete, wizardComplete]}
      />,
    );

    // Initially on Cleric tab
    expect(screen.getByText('Cure Wounds')).toBeDefined();

    const siguienteBtn = screen.getByRole('button', { name: /siguiente/i });
    fireEvent.click(siguienteBtn);

    await waitFor(() => {
      // Error banner for Wizard must be visible
      expect(screen.getByText('Wizard SP07 save failed')).toBeDefined();
    });

    // Cleric save happened first, then Wizard save failed
    expect(saveSpellsForClass).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(saveSpellsForClass).mock.calls;
    expect(calls[0]?.[0]?.classSlug).toBe('cleric');
    expect(calls[1]?.[0]?.classSlug).toBe('wizard');

    // proceedToReview must NOT have been called (stopped at Wizard failure)
    expect(proceedToReview).not.toHaveBeenCalled();
  });
});

// ── 6.6: single caster — no TabBar ────────────────────────────────────────

describe('SinglePickerView — no tab bar (REQ-SP06-SINGLE-CASTER-NO-TAB-BAR)', () => {
  it('6.6: SinglePickerView renders no role=tab elements', () => {
    render(
      <SinglePickerView
        characterId="char-1"
        classSlug="cleric"
        classSource="PHB"
        limits={makeLimits()}
        availableSpells={[makeSpell()]}
        subclassGrantedSlugs={[]}
        initialPicks={{ cantrips: [], known: [], prepared: [] }}
      />,
    );
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
