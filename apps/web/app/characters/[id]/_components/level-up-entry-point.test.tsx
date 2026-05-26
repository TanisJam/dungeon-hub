/**
 * LevelUpEntryPoint — visibility matrix tests.
 *
 * REQ-CLU-UI-ENTRY visibility rules:
 *   - active + non-gm + enough XP → shown
 *   - draft → hidden
 *   - active + gm → hidden (DM should not level up player chars)
 *   - active + non-gm + insufficient XP → hidden
 *   - active + totalLevel 14 (cap) → hidden
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LevelUpEntryPoint } from './level-up-entry-point';

const BASE = {
  characterId: 'char-1',
  status: 'active',
  totalLevel: 1,
  xp: 300, // exactly enough for L2
  callerRole: 'player' as const,
};

describe('LevelUpEntryPoint — visibility', () => {
  it('EP-1: active player with sufficient XP → shows pill', () => {
    render(<LevelUpEntryPoint {...BASE} />);
    expect(screen.getByRole('link', { name: /subir de nivel/i })).toBeTruthy();
  });

  it('EP-2: draft character → hidden', () => {
    const { container } = render(<LevelUpEntryPoint {...BASE} status="draft" />);
    expect(container.firstChild).toBeNull();
  });

  it('EP-3: gm caller → hidden (DM does not level up player chars)', () => {
    const { container } = render(<LevelUpEntryPoint {...BASE} callerRole="gm" />);
    expect(container.firstChild).toBeNull();
  });

  it('EP-4: null callerRole → shown (non-member still could be player)', () => {
    // callerRole null means the world fetch failed; we show the button optimistically
    // since the API will enforce ownership. But spec says only non-gm.
    // null is not 'gm' so the button is shown.
    render(<LevelUpEntryPoint {...BASE} callerRole={null} />);
    expect(screen.getByRole('link', { name: /subir de nivel/i })).toBeTruthy();
  });

  it('EP-5: active player with insufficient XP (299) → hidden', () => {
    const { container } = render(
      <LevelUpEntryPoint {...BASE} xp={299} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('EP-6: totalLevel 14 (MVP cap) → hidden regardless of XP', () => {
    const { container } = render(
      <LevelUpEntryPoint {...BASE} totalLevel={14} xp={165_000} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('EP-7: pending_approval status → hidden', () => {
    const { container } = render(
      <LevelUpEntryPoint {...BASE} status="pending_approval" />,
    );
    expect(container.firstChild).toBeNull();
  });
});
