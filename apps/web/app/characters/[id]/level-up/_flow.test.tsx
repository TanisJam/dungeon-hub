/**
 * LevelUpFlow — component tests for the 6-step level-up stepper.
 *
 * Closes W1 from SDD multiclass-class-step verify-report (#884).
 *
 * Tests cover:
 *   T1: ModeStep renders 2 options when multiclassingEnabled=true, 1 option when false.
 *   T2: Same-class branch with single owned class — class-picker shows the class and
 *       clicking it advances to HP step (no auto-skip: flow always visits ClassStep).
 *   T3: HP step with method='roll' → submit calls submitLevelUp with hp.method='roll'.
 *   T4: ASI-feat step rendered when target class level is an ASI level (isAsiLevel=true);
 *       ASI tab is default; submit disabled until delta sum === 2.
 *   T5: Review step → submit happy path calls submitLevelUp and shows success screen.
 *   T6: Submit error path → mocked error → inline alert shown, flow stays open.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// Mock next/navigation — LevelUpFlow calls useRouter().push() on success.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock the actions module. submitLevelUp default: success.
vi.mock('./actions', () => ({
  submitLevelUp: vi.fn().mockResolvedValue({
    ok: true,
    summary: {
      classSlug: 'fighter',
      fromClassLevel: 1,
      toClassLevel: 2,
      totalLevelAfter: 2,
      hpDelta: 8,
      rollUsed: null,
      asiFeatApplied: undefined,
    },
  }),
}));

import { LevelUpFlow } from './_flow';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

interface OwnedClass {
  slug: string;
  source: string;
  level: number;
  hitDie: string;
  isAsiLevel: boolean;
}

const FIGHTER_L1: OwnedClass = { slug: 'fighter', source: 'PHB', level: 1, hitDie: 'd10', isAsiLevel: false };
const FIGHTER_L3_ASI: OwnedClass = { slug: 'fighter', source: 'PHB', level: 3, hitDie: 'd10', isAsiLevel: true };

const BASE_PROPS = {
  characterId: 'char-uuid-1',
  characterName: 'Thorin',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// T1 — ModeStep visibility gate
// ---------------------------------------------------------------------------

describe('T1 — ModeStep: multiclassing gate', () => {
  it('shows 2 options (same-class + new-class) when multiclassingEnabled=true', () => {
    render(
      <LevelUpFlow
        {...BASE_PROPS}
        ownedClasses={[FIGHTER_L1]}
        multiclassingEnabled={true}
      />,
    );
    expect(screen.getByText('Subir clase existente')).toBeTruthy();
    expect(screen.getByText('Agregar nueva clase')).toBeTruthy();
  });

  it('shows only 1 option (same-class) when multiclassingEnabled=false', () => {
    render(
      <LevelUpFlow
        {...BASE_PROPS}
        ownedClasses={[FIGHTER_L1]}
        multiclassingEnabled={false}
      />,
    );
    expect(screen.getByText('Subir clase existente')).toBeTruthy();
    expect(screen.queryByText('Agregar nueva clase')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T2 — Same-class branch: single class → ClassStep renders it → HP step
// ---------------------------------------------------------------------------

describe('T2 — Same-class branch navigates through ClassStep to HP', () => {
  it('clicking same-class then the single class card advances to HP step', async () => {
    render(
      <LevelUpFlow
        {...BASE_PROPS}
        ownedClasses={[FIGHTER_L1]}
        multiclassingEnabled={false}
      />,
    );

    // Step 1: click "Subir clase existente"
    await act(async () => {
      fireEvent.click(screen.getByText('Subir clase existente'));
    });

    // ClassStep renders — "Guerrero" (Fighter label) is visible.
    expect(screen.getByText('Guerrero')).toBeTruthy();
    // Subtitle shows "Nivel 1 → 2"
    expect(screen.getByText('Nivel 1 → 2')).toBeTruthy();

    // Click the class button to advance to HP step.
    await act(async () => {
      fireEvent.click(screen.getByText('Guerrero'));
    });

    // HP step is now active.
    expect(screen.getByText('¿Cómo calculás tu HP?')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T3 — HP step: method='roll' → submitLevelUp called with hp.method='roll'
// ---------------------------------------------------------------------------

describe('T3 — HP step: roll method submitted correctly', () => {
  it('selecting "Tirar dado" and continuing submits hp.method=roll to the action', async () => {
    const { submitLevelUp } = await import('./actions');

    render(
      <LevelUpFlow
        {...BASE_PROPS}
        ownedClasses={[FIGHTER_L1]}
        multiclassingEnabled={false}
      />,
    );

    // Navigate to HP step.
    await act(async () => {
      fireEvent.click(screen.getByText('Subir clase existente'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guerrero'));
    });

    // HP step: select "Tirar dado".
    await act(async () => {
      fireEvent.click(screen.getByText('Tirar dado'));
    });

    // Advance to review step.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    });

    // Review step is shown; click submit.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar subida de nivel' }));
    });

    await waitFor(() => {
      expect(submitLevelUp).toHaveBeenCalledOnce();
    });

    const [, body] = vi.mocked(submitLevelUp).mock.calls[0]!;
    expect(body.hp.method).toBe('roll');
  });
});

// ---------------------------------------------------------------------------
// T4 — ASI-feat step: rendered when isAsiLevel=true; default tab; disabled until sum=2
// ---------------------------------------------------------------------------

describe('T4 — ASI-feat step gating and validation', () => {
  it('ASI-feat step appears when class isAsiLevel=true; ASI tab default; submit disabled until sum=2', async () => {
    render(
      <LevelUpFlow
        {...BASE_PROPS}
        ownedClasses={[FIGHTER_L3_ASI]}
        multiclassingEnabled={false}
      />,
    );

    // Navigate to ClassStep → HP step.
    await act(async () => {
      fireEvent.click(screen.getByText('Subir clase existente'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guerrero'));
    });

    // HP step: default (average) → continue.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    });

    // ASI-feat step is now rendered.
    expect(screen.getByText('Mejora de características')).toBeTruthy();

    // ASI tab is default (active).
    const asiTab = screen.getByRole('button', { name: 'Atributo (+2)' });
    expect(asiTab.className).toContain('bg-primary');

    // Continue is disabled (sum=0, needs 2).
    const continueBtn = screen.getByRole('button', { name: 'Continuar' });
    expect((continueBtn as HTMLButtonElement).disabled).toBe(true);

    // Click +2 on STR (FUE).
    const strRow = screen.getByText('FUE').closest('div')!;
    const plusTwoBtn = strRow.querySelectorAll('button')[2]!; // [+0, +1, +2] → index 2
    await act(async () => {
      fireEvent.click(plusTwoBtn);
    });

    // Now sum=2 → Continuar is enabled.
    expect((screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T5 — Submit happy path: review → submitLevelUp called → success screen shown
// ---------------------------------------------------------------------------

describe('T5 — Submit happy path', () => {
  it('review step submit calls submitLevelUp(characterId, body) and renders success screen', async () => {
    const { submitLevelUp } = await import('./actions');
    vi.mocked(submitLevelUp).mockResolvedValue({
      ok: true,
      summary: {
        classSlug: 'fighter',
        fromClassLevel: 1,
        toClassLevel: 2,
        totalLevelAfter: 2,
        hpDelta: 8,
        rollUsed: null,
      },
    });

    render(
      <LevelUpFlow
        {...BASE_PROPS}
        ownedClasses={[FIGHTER_L1]}
        multiclassingEnabled={false}
      />,
    );

    // Navigate to review step.
    await act(async () => {
      fireEvent.click(screen.getByText('Subir clase existente'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guerrero'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    });

    // Submit.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar subida de nivel' }));
    });

    await waitFor(() => {
      expect(submitLevelUp).toHaveBeenCalledWith('char-uuid-1', expect.objectContaining({
        kind: 'same-class',
        class: { slug: 'fighter', source: 'PHB' },
      }));
    });

    // Success screen shown.
    await waitFor(() => {
      expect(screen.getByText('¡Subiste de nivel!')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// T6 — Submit error path: inline alert shown, flow stays open
// ---------------------------------------------------------------------------

describe('T6 — Submit error path', () => {
  it('when submitLevelUp returns ok=false, shows inline alert and keeps flow open', async () => {
    const { submitLevelUp } = await import('./actions');
    vi.mocked(submitLevelUp).mockResolvedValue({
      ok: false,
      error: 'LEVELUP_INSUFFICIENT_XP',
    });

    render(
      <LevelUpFlow
        {...BASE_PROPS}
        ownedClasses={[FIGHTER_L1]}
        multiclassingEnabled={false}
      />,
    );

    // Navigate to review step.
    await act(async () => {
      fireEvent.click(screen.getByText('Subir clase existente'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Guerrero'));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    });

    // Submit.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar subida de nivel' }));
    });

    // Inline error alert should be visible.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByRole('alert').textContent).toContain('LEVELUP_INSUFFICIENT_XP');
    });

    // Flow stays open — review step still rendered.
    expect(screen.getByRole('button', { name: 'Confirmar subida de nivel' })).toBeTruthy();
    // Success screen NOT shown.
    expect(screen.queryByText('¡Subiste de nivel!')).toBeNull();
  });
});
