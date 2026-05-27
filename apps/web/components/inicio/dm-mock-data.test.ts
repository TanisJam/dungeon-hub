import { describe, it, expect } from 'vitest';
import { MOCK_PENDING_FICHAS } from './dm-mock-data';

describe('MOCK_PENDING_FICHAS (PFS-MOCK-DATA-EXT-12)', () => {
  it('has exactly 3 entries', () => {
    expect(MOCK_PENDING_FICHAS).toHaveLength(3);
  });

  it('has exactly 1 entry with fresh=true', () => {
    expect(MOCK_PENDING_FICHAS.filter((f) => f.fresh)).toHaveLength(1);
  });

  it('has exactly 2 entries with fresh=false', () => {
    expect(MOCK_PENDING_FICHAS.filter((f) => !f.fresh)).toHaveLength(2);
  });
});
