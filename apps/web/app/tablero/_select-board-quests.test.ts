import { describe, it, expect } from 'vitest';
import { selectBoardQuests, type BoardQuest } from './_select-board-quests';

function quest(overrides: Partial<BoardQuest>): BoardQuest {
  return {
    id: 'q-1',
    title: 'Quest',
    description: null,
    status: 'available',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('selectBoardQuests', () => {
  it('T1: keeps quests with status available or active', () => {
    const result = selectBoardQuests([
      quest({ id: 'a', status: 'available' }),
      quest({ id: 'b', status: 'active' }),
    ]);
    expect(result.map((q) => q.id)).toEqual(['a', 'b']);
  });

  it('T2: drops quests with status completed or abandoned', () => {
    const result = selectBoardQuests([
      quest({ id: 'a', status: 'completed' }),
      quest({ id: 'b', status: 'abandoned' }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('T3: mixed list keeps only available/active and drops the rest', () => {
    const result = selectBoardQuests([
      quest({ id: 'a', status: 'available' }),
      quest({ id: 'b', status: 'completed' }),
      quest({ id: 'c', status: 'active' }),
      quest({ id: 'd', status: 'abandoned' }),
    ]);
    expect(result.map((q) => q.id).sort()).toEqual(['a', 'c']);
  });

  it('T4: orders available quests before active quests', () => {
    const result = selectBoardQuests([
      quest({ id: 'active-one', status: 'active', updatedAt: '2026-01-05T00:00:00.000Z' }),
      quest({ id: 'available-one', status: 'available', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(result.map((q) => q.id)).toEqual(['available-one', 'active-one']);
  });

  it('T5: within the same status, orders most recently updated first', () => {
    const result = selectBoardQuests([
      quest({ id: 'older', status: 'available', updatedAt: '2026-01-01T00:00:00.000Z' }),
      quest({ id: 'newer', status: 'available', updatedAt: '2026-01-10T00:00:00.000Z' }),
      quest({ id: 'middle', status: 'available', updatedAt: '2026-01-05T00:00:00.000Z' }),
    ]);
    expect(result.map((q) => q.id)).toEqual(['newer', 'middle', 'older']);
  });

  it('T6: full ordering rule — available (desc by updatedAt) then active (desc by updatedAt)', () => {
    const result = selectBoardQuests([
      quest({ id: 'active-old', status: 'active', updatedAt: '2026-01-02T00:00:00.000Z' }),
      quest({ id: 'available-old', status: 'available', updatedAt: '2026-01-01T00:00:00.000Z' }),
      quest({ id: 'active-new', status: 'active', updatedAt: '2026-01-09T00:00:00.000Z' }),
      quest({ id: 'available-new', status: 'available', updatedAt: '2026-01-08T00:00:00.000Z' }),
    ]);
    expect(result.map((q) => q.id)).toEqual([
      'available-new',
      'available-old',
      'active-new',
      'active-old',
    ]);
  });

  it('T7: empty input yields an empty result (drives the page empty state)', () => {
    expect(selectBoardQuests([])).toEqual([]);
  });

  it('T8: all-completed/abandoned input yields an empty result (drives the page empty state)', () => {
    const result = selectBoardQuests([
      quest({ id: 'a', status: 'completed' }),
      quest({ id: 'b', status: 'abandoned' }),
    ]);
    expect(result).toEqual([]);
  });

  it('T9: does not mutate the input array', () => {
    const input = [
      quest({ id: 'a', status: 'active', updatedAt: '2026-01-01T00:00:00.000Z' }),
      quest({ id: 'b', status: 'available', updatedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const inputCopy = [...input];
    selectBoardQuests(input);
    expect(input).toEqual(inputCopy);
  });
});
