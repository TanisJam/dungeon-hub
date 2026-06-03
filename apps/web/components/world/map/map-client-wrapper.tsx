'use client';

/**
 * map-client-wrapper.tsx — ssr:false dynamic import boundary for the Leaflet island.
 *
 * Why this wrapper exists (mirrors hex-client-wrapper.tsx pattern):
 *   Leaflet accesses `window` and `document` on import — it cannot be SSR'd.
 *   Next.js `dynamic(..., {ssr:false})` ensures the import never runs on the server.
 *   This wrapper is the ONLY place where `ssr:false` is used for the map.
 *
 * Props are forwarded as-is to WorldMapLeaflet.
 * Slice 2: pois + effectiveView added for the POI marker layer (REQ-POI-MARKER-02).
 *
 * REQ-WM-03 (ssr:false requirement).
 */

import dynamic from 'next/dynamic';
import type { PoiRow } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';

const WorldMapLeafletDynamic = dynamic(
  () => import('./world-map-leaflet').then((m) => ({ default: m.WorldMapLeaflet })),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-x-0 bottom-16 top-[120px] z-10 flex items-center justify-center bg-paper"
        data-testid="map-container"
      >
        <p className="text-sm text-ink-muted">Cargando mapa…</p>
      </div>
    ),
  },
);

interface MapClientWrapperProps {
  /** Supabase Storage base URL (NEXT_PUBLIC_SUPABASE_URL from lib/env.ts). */
  supabaseUrl: string;
  /** World-scope POI list (SSR-fetched, server-filtered for role). REQ-POI-MARKER-01. */
  pois: PoiRow[];
  /** Effective view for the DM-notes gate inside PoiDetail. REQ-POI-MARKER-02. */
  effectiveView: EffectiveView;
}

export function MapClientWrapper({ supabaseUrl, pois, effectiveView }: MapClientWrapperProps) {
  return <WorldMapLeafletDynamic supabaseUrl={supabaseUrl} pois={pois} effectiveView={effectiveView} />;
}
