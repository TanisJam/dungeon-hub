/**
 * CharacterRow — DM world landing character card row.
 *
 * REQ-WDCL-WEB-LANDING (spec #857) — name, owner username, class+level, status pill,
 * link to /characters/[id], tap target ≥44px (we enforce ≥64px via min-h-[64px]).
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { CharacterRow, type ListedWorldCharacter } from './character-row';

function makeCharacter(overrides: Partial<ListedWorldCharacter> = {}): ListedWorldCharacter {
  return {
    id: 'char-1',
    name: 'Thorin',
    status: 'pending_approval',
    classes: [{ classSlug: 'fighter', level: 3 }],
    level: 3,
    ownerUserId: 'user-1',
    ownerUsername: 'mauricio',
    ...overrides,
  };
}

describe('CharacterRow', () => {
  it('renders character name + owner username + class level', () => {
    render(
      <ul>
        <CharacterRow character={makeCharacter()} />
      </ul>,
    );
    expect(screen.getByText('Thorin')).toBeTruthy();
    expect(screen.getByText(/mauricio/)).toBeTruthy();
    expect(screen.getByText(/fighter L3/)).toBeTruthy();
  });

  it('renders multiclass labels separated by " / "', () => {
    render(
      <ul>
        <CharacterRow
          character={makeCharacter({
            classes: [
              { classSlug: 'fighter', level: 3 },
              { classSlug: 'wizard', level: 2 },
            ],
            level: 5,
          })}
        />
      </ul>,
    );
    expect(screen.getByText(/fighter L3 \/ wizard L2/)).toBeTruthy();
  });

  it('renders Pendiente pill when status is pending_approval', () => {
    render(
      <ul>
        <CharacterRow character={makeCharacter({ status: 'pending_approval' })} />
      </ul>,
    );
    expect(screen.getByText('Pendiente')).toBeTruthy();
  });

  it('renders Activo pill when status is active', () => {
    render(
      <ul>
        <CharacterRow character={makeCharacter({ status: 'active' })} />
      </ul>,
    );
    expect(screen.getByText('Activo')).toBeTruthy();
  });

  it('wraps row in a Link to /characters/<id>', () => {
    const { container } = render(
      <ul>
        <CharacterRow character={makeCharacter({ id: 'abc-123' })} />
      </ul>,
    );
    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/characters/abc-123');
  });

  it('enforces min-h-[64px] tap target (≥44px REQ-WDCL-WEB-LANDING mobile)', () => {
    const { container } = render(
      <ul>
        <CharacterRow character={makeCharacter()} />
      </ul>,
    );
    const link = container.querySelector('a');
    expect(link?.className).toContain('min-h-[64px]');
  });
});
