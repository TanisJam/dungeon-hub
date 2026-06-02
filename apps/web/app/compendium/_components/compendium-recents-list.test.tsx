import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompendiumRecentsList } from './compendium-recents-list';

describe('CompendiumRecentsList', () => {
  it('renders honest empty state — no fake rows', () => {
    const { getByText, queryByText } = render(<CompendiumRecentsList />);
    expect(getByText('Aún no consultaste ninguna entrada.')).toBeTruthy();
  });

  it('does NOT render fake "Bola de fuego" entry', () => {
    const { queryByText } = render(<CompendiumRecentsList />);
    expect(queryByText('Bola de fuego')).toBeNull();
  });

  it('does NOT render fake "Mano Arcana" entry', () => {
    const { queryByText } = render(<CompendiumRecentsList />);
    expect(queryByText('Mano Arcana')).toBeNull();
  });
});
