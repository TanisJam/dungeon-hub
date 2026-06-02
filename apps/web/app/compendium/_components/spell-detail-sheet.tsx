'use client';

import { V3Sheet } from '@/components/ui';
import { SpellDetailBody } from './spell-detail-body';
import type { SpellDetail } from './types';

interface SpellDetailSheetProps {
  open: boolean;
  onClose: () => void;
  /** Real spell data from the API (GET /compendium/spells/:slug). */
  spell: SpellDetail;
}

/**
 * SpellDetailSheet — client component wrapping V3Sheet with spell detail body.
 * Dormant: no caller on /compendium yet. Requires a spell-list/search UI (separate feature).
 * The hardcoded Fireball mock has been removed — this component now requires real spell data.
 */
export function SpellDetailSheet({ open, onClose, spell }: SpellDetailSheetProps) {
  return (
    <V3Sheet open={open} onClose={onClose} title={spell.eyebrow}>
      <SpellDetailBody spell={spell} />
    </V3Sheet>
  );
}
