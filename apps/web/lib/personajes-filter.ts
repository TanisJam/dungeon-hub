import type { RosterCharacter, StatusChip, ChipCounts } from '@/components/personajes/types';

const VALID: ReadonlySet<StatusChip> = new Set(['active', 'pending', 'retired', 'all']);

export function parseChip(raw: string | undefined): StatusChip {
  return raw && VALID.has(raw as StatusChip) ? (raw as StatusChip) : 'active';
}

export function filterByStatusChip(
  chars: ReadonlyArray<RosterCharacter>,
  chip: StatusChip,
): RosterCharacter[] {
  const nonDraft = chars.filter((c) => c.status !== 'draft');
  switch (chip) {
    case 'active':
      return nonDraft.filter((c) => c.status === 'active');
    case 'pending':
      return nonDraft.filter((c) => c.status === 'pending_approval');
    case 'retired':
      return nonDraft.filter((c) => c.status === 'retired' || c.status === 'dead');
    case 'all':
      return nonDraft;
  }
}

export function computeCounts(chars: ReadonlyArray<RosterCharacter>): ChipCounts {
  return {
    active: filterByStatusChip(chars, 'active').length,
    pending: filterByStatusChip(chars, 'pending').length,
    retired: filterByStatusChip(chars, 'retired').length,
    all: filterByStatusChip(chars, 'all').length,
  };
}
