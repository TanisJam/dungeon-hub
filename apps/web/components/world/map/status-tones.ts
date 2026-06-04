/**
 * Shared status → PillTone lookup maps for hex and POI status pills.
 *
 * B2: consolidates duplicated STATUS_STYLE / POI_STATUS_STYLE maps that used
 * raw Tailwind color classes (bg-stone-100, bg-amber-100, bg-blue-100, bg-green-100).
 * Now all status pills route through <Pill> with design-system tokens.
 *
 * Mapping rationale:
 *   unexplored / unknown → stone  (neutral, dim)
 *   rumored              → amber  (warm, uncertain)
 *   explored / discovered→ primary (cyan — "seen, known")
 *   cleared / cleared    → success (green — "safe, done")
 */

import type { PillTone } from '@/components/ui/pill';
import type { HexStatus } from '@/app/mapa/actions';
import type { PoiStatus } from '@/app/mapa/actions';

export const HEX_STATUS_TONE: Record<HexStatus, PillTone> = {
  unexplored: 'stone',
  rumored:    'amber',
  explored:   'primary',
  cleared:    'success',
};

export const POI_STATUS_TONE: Record<PoiStatus, PillTone> = {
  unknown:    'stone',
  discovered: 'primary',
  cleared:    'success',
};
