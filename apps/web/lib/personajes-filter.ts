import type { RosterCharacter, StatusChip, ChipCounts } from '@/components/personajes/types';

const VALID: ReadonlySet<StatusChip> = new Set(['active', 'pending', 'retired', 'draft', 'all']);

export function parseChip(raw: string | undefined): StatusChip {
  return raw && VALID.has(raw as StatusChip) ? (raw as StatusChip) : 'active';
}

/**
 * Returns characters matching the given chip filter.
 *
 * - active   → status === 'active'
 * - pending  → status === 'pending_approval'
 * - retired  → status === 'retired' | 'dead'
 * - draft    → status === 'draft'
 * - all      → every character (all statuses including draft)
 */
export function filterByStatusChip(
  chars: ReadonlyArray<RosterCharacter>,
  chip: StatusChip,
): RosterCharacter[] {
  switch (chip) {
    case 'active':
      return chars.filter((c) => c.status === 'active');
    case 'pending':
      return chars.filter((c) => c.status === 'pending_approval');
    case 'retired':
      return chars.filter((c) => c.status === 'retired' || c.status === 'dead');
    case 'draft':
      return chars.filter((c) => c.status === 'draft');
    case 'all':
      return [...chars];
  }
}

export function computeCounts(chars: ReadonlyArray<RosterCharacter>): ChipCounts {
  return {
    active: filterByStatusChip(chars, 'active').length,
    pending: filterByStatusChip(chars, 'pending').length,
    retired: filterByStatusChip(chars, 'retired').length,
    draft: filterByStatusChip(chars, 'draft').length,
    all: filterByStatusChip(chars, 'all').length,
  };
}
