/**
 * Tests for SpellPrepSectionEditor — SPELL-PREP-01, SPELL-PREP-06.
 *
 * T1: Pencil button with aria-label "Preparar hechizos – cleric" is present.
 * T2: Clicking pencil opens V3Sheet (dialog visible).
 * T3: Loading state shown while options fetch is in-flight.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

// Mock the save action
vi.mock('./save-spell-prep-action', () => ({
  saveSpellPrepForClass: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock client-side supabase
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok-client' } },
      }),
    },
  }),
}));

// Mock api — slow fetch to test loading state
let resolveOptions: (v: unknown) => void = () => {};
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockImplementation(
      () => new Promise((res) => { resolveOptions = res; }),
    ),
  },
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown, message: string) {
      super(message);
      this.status = status;
      this.body = body;
    }
  },
}));

import { api } from '@/lib/api';
import { SpellPrepSectionEditor } from './spell-prep-section-editor';

const baseProps = {
  characterId: 'char-1',
  classSlug: 'cleric',
  initialPrepared: [],
  prepLimit: 6,
  existingCantrips: [],
  existingKnown: [],
};

describe('SpellPrepSectionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock so each test has its own pending promise
    (api.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((res) => { resolveOptions = res; }),
    );
  });

  it('T1: pencil button with aria-label "Preparar hechizos – cleric" is present', () => {
    render(<SpellPrepSectionEditor {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Preparar hechizos – cleric' })).toBeTruthy();
  });

  it('T2: clicking pencil opens V3Sheet (dialog visible)', async () => {
    render(<SpellPrepSectionEditor {...baseProps} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preparar hechizos – cleric' }));
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('T3: loading state shown while options fetch is in-flight', async () => {
    render(<SpellPrepSectionEditor {...baseProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preparar hechizos – cleric' }));
    });
    // Options fetch hasn't resolved yet — should show loading indicator
    expect(screen.getByText(/cargando/i)).toBeTruthy();
  });

  /**
   * T4: knownUniverseSlugs forwarded to SpellPrepEditor.
   * When options load and knownUniverseSlugs is provided, only spells in the set appear.
   * SPELL-PREP-02: SpellPrepSectionEditor must accept and forward knownUniverseSlugs.
   */
  it('T4: knownUniverseSlugs forwarded — only spellbook spells visible after load', async () => {
    const knownUniverseSlugs = new Set(['magic-missile']);

    render(
      <SpellPrepSectionEditor
        {...baseProps}
        classSlug="wizard"
        knownUniverseSlugs={knownUniverseSlugs}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preparar hechizos – wizard' }));
    });

    // Resolve the fetch with 2 available spells — only 1 in the known set
    await act(async () => {
      resolveOptions({
        limits: { spellsPrepared: 4 },
        availableSpells: [
          { slug: 'magic-missile', source: 'PHB', name: 'Magic Missile', level: 1, ritual: false, concentration: false, componentsM: false, componentsMCost: null },
          { slug: 'fireball', source: 'PHB', name: 'Fireball', level: 3, ritual: false, concentration: false, componentsM: false, componentsMCost: null },
        ],
        subclassGrantedSlugs: [],
      });
    });

    // Only magic-missile (in spellbook) should appear; fireball should not
    expect(screen.getByText('Magic Missile')).toBeTruthy();
    expect(screen.queryByText('Fireball')).toBeNull();
  });
});
