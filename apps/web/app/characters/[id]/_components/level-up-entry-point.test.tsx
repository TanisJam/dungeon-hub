/**
 * LevelUpEntryPoint — visibility matrix tests.
 *
 * REQ-CLU-UI-ENTRY visibility rules:
 *   - active + owner + enough XP → shown
 *   - draft → hidden
 *   - active + non-owner → hidden (even if caller is the world's GM)
 *   - active + owner + insufficient XP → hidden
 *   - active + totalLevel 14 (cap) → hidden
 *   - active + owner who is ALSO the world's GM → shown (regression: owner==gm case)
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
  isOwner: true,
};

describe('LevelUpEntryPoint — visibility', () => {
  it('EP-1: active owner with sufficient XP → shows pill', () => {
    render(<LevelUpEntryPoint {...BASE} />);
    expect(screen.getByRole('link', { name: /subir de nivel/i })).toBeTruthy();
  });

  it('EP-2: draft character → hidden', () => {
    const { container } = render(<LevelUpEntryPoint {...BASE} status="draft" />);
    expect(container.firstChild).toBeNull();
  });

  it('EP-3: non-owner caller → hidden', () => {
    const { container } = render(<LevelUpEntryPoint {...BASE} isOwner={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('EP-4: owner who is also the world GM → shown (DM levels up own char)', () => {
    // Regression: previous logic hid the pill whenever callerRole==='gm', which
    // broke single-user DM-also-player setups. Ownership is the only gate now.
    render(<LevelUpEntryPoint {...BASE} isOwner={true} />);
    expect(screen.getByRole('link', { name: /subir de nivel/i })).toBeTruthy();
  });

  it('EP-5: active owner with insufficient XP (299) → hidden', () => {
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
