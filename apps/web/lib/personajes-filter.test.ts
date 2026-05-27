import { describe, it, expect } from 'vitest';
import {
  parseChip,
  filterByStatusChip,
  computeCounts,
} from './personajes-filter';
import type { RosterCharacter } from '@/components/personajes/types';

// ── Fixture ──────────────────────────────────────────────────────────────────

const makeChar = (
  id: string,
  status: RosterCharacter['status'],
): RosterCharacter => ({
  id,
  worldId: 'world-1',
  name: `Char ${id}`,
  status,
  xp: 0,
  updatedAt: '2026-01-01',
});

const MIXED: RosterCharacter[] = [
  makeChar('a1', 'active'),
  makeChar('a2', 'active'),
  makeChar('p1', 'pending_approval'),
  makeChar('r1', 'retired'),
  makeChar('d1', 'dead'),
  makeChar('dr1', 'draft'),
];

// ── parseChip ─────────────────────────────────────────────────────────────────

describe('parseChip', () => {
  it('returns "active" for undefined', () => {
    expect(parseChip(undefined)).toBe('active');
  });

  it('returns "active" for unknown string', () => {
    expect(parseChip('foobar')).toBe('active');
  });

  it('returns the chip for "active"', () => {
    expect(parseChip('active')).toBe('active');
  });

  it('returns the chip for "pending"', () => {
    expect(parseChip('pending')).toBe('pending');
  });

  it('returns the chip for "retired"', () => {
    expect(parseChip('retired')).toBe('retired');
  });

  it('returns the chip for "all"', () => {
    expect(parseChip('all')).toBe('all');
  });

  it('returns the chip for "draft"', () => {
    expect(parseChip('draft')).toBe('draft');
  });
});

// ── filterByStatusChip ────────────────────────────────────────────────────────

describe('filterByStatusChip', () => {
  it('active chip: returns only active chars, no drafts', () => {
    const result = filterByStatusChip(MIXED, 'active');
    expect(result.map((c) => c.id)).toEqual(['a1', 'a2']);
  });

  it('pending chip: returns only pending_approval chars', () => {
    const result = filterByStatusChip(MIXED, 'pending');
    expect(result.map((c) => c.id)).toEqual(['p1']);
  });

  it('retired chip: returns retired AND dead chars', () => {
    const result = filterByStatusChip(MIXED, 'retired');
    expect(result.map((c) => c.id)).toEqual(['r1', 'd1']);
  });

  it('draft chip: returns only draft chars', () => {
    const result = filterByStatusChip(MIXED, 'draft');
    expect(result.map((c) => c.id)).toEqual(['dr1']);
  });

  it('draft chip: returns empty for non-draft list', () => {
    const result = filterByStatusChip(
      [makeChar('a1', 'active'), makeChar('p1', 'pending_approval')],
      'draft',
    );
    expect(result).toHaveLength(0);
  });

  // Semantic change: 'all' now INCLUDES drafts (truly all)
  it('all chip: includes active+pending+retired+dead+draft', () => {
    const result = filterByStatusChip(MIXED, 'all');
    expect(result.map((c) => c.id)).toEqual(['a1', 'a2', 'p1', 'r1', 'd1', 'dr1']);
  });

  it('all chip: a draft-only list returns the draft', () => {
    const result = filterByStatusChip([makeChar('dr2', 'draft')], 'all');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('dr2');
  });
});

// ── computeCounts ─────────────────────────────────────────────────────────────

describe('computeCounts', () => {
  it('returns correct counts for mixed fixture', () => {
    const counts = computeCounts(MIXED);
    expect(counts.active).toBe(2);
    expect(counts.pending).toBe(1);
    expect(counts.retired).toBe(2); // retired + dead
    expect(counts.draft).toBe(1);   // 1 draft
    expect(counts.all).toBe(6);    // now includes draft
  });
});
