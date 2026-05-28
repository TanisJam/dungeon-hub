import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CompendiumRecentsList } from './compendium-recents-list';

describe('CompendiumRecentsList', () => {
  it('WCP-RECENTS-05: renders 4 rows in order', () => {
    const { container } = render(<CompendiumRecentsList />);
    // WCP-RECENTS-05: 4 static recent rows
    const rows = container.querySelectorAll('.compendium-init-row');
    expect(rows.length).toBe(4);
  });

  it('WCP-RECENTS-05: Fireball row calls onOpenFireball on click', () => {
    const onOpenFireball = vi.fn();
    const { getByText } = render(
      <CompendiumRecentsList onOpenFireball={onOpenFireball} />,
    );
    // WCP-RECENTS-05: Fireball row is tappable
    fireEvent.click(getByText('Bola de fuego'));
    expect(onOpenFireball).toHaveBeenCalledTimes(1);
  });
});
