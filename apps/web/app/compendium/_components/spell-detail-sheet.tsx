'use client';

import { V3Sheet } from '@/components/ui';
import { SpellDetailBody } from './spell-detail-body';
import { V3_SPELL_DETAIL } from './data';

interface SpellDetailSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * SpellDetailSheet — client component wrapping V3Sheet with Fireball detail body.
 * WCDS-OPEN-02: controlled open/close state; focus trap inherited from V3Sheet.
 */
export function SpellDetailSheet({ open, onClose }: SpellDetailSheetProps) {
  return (
    <V3Sheet open={open} onClose={onClose} title={V3_SPELL_DETAIL.eyebrow}>
      <SpellDetailBody spell={V3_SPELL_DETAIL} />
    </V3Sheet>
  );
}
