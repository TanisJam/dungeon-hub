'use client';

import { useState } from 'react';
import { StatTile } from '@/components/wizard/stat-tile';

/**
 * Dev-only client island for StatTile.
 * Owns the click/selection state so the registry (a server module) does not
 * need to pass onClick across the server→client boundary.
 */
export function StatTileIsland(props: {
  ability: string;
  value: number | null;
}) {
  const [isLastSelected, setIsLastSelected] = useState(false);
  return (
    <StatTile
      ability={props.ability}
      value={props.value}
      isLastSelected={isLastSelected}
      onClick={() => setIsLastSelected((v) => !v)}
    />
  );
}
