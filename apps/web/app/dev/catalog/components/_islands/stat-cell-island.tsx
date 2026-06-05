'use client';

import { useState } from 'react';
import { StatCell } from '@/components/ui/stat-cell';
import { Pill } from '@/components/ui/pill';

/**
 * Dev-only client island for interactive StatCell variants.
 * Owns click/selected state so the registry (a server module) does not
 * need to pass onClick across the server→client boundary.
 */
export function StatCellClickableIsland() {
  const [selected, setSelected] = useState(false);
  return (
    <StatCell
      label="FUE"
      value={16}
      sub={selected ? 'seleccionado' : '+3'}
      selected={selected}
      onClick={() => setSelected((v) => !v)}
      ariaLabel="FUE: 16"
    />
  );
}

/**
 * Static showcase of StatCell variants (no interactivity needed).
 */
export { StatCell, Pill };
