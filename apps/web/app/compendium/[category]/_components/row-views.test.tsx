// market-shop-buy-ui slice 3c — ItemRowView price display when shopContext is present.
// REQ PRICE-ROW-01, BROWSE-UNCHANGED-01 (row portion).
// afterEach(cleanup) is global (apps/web/vitest.setup.ts) — do NOT re-add.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ItemRowView } from './row-views';

const LONGSWORD_HIT = {
  slug: 'longsword',
  source: 'PHB',
  name: 'Longsword',
  type: 'M',
  weight: '3',
  costCp: 1500, // 15 gp — PHB p.149
};

describe('ItemRowView — shop price (market-shop-buy-ui 3c)', () => {
  it('PRICE-ROW-01: shows "15 gp" when shopContext is present', () => {
    const { getByText } = render(
      <ItemRowView row={LONGSWORD_HIT} shopContext={{ characterId: 'c1' }} />,
    );
    expect(getByText('15 gp')).toBeTruthy();
  });

  it('BROWSE-UNCHANGED-01: shows no price text when shopContext is absent', () => {
    const { queryByText } = render(<ItemRowView row={LONGSWORD_HIT} />);
    expect(queryByText('15 gp')).toBeNull();
  });
});
