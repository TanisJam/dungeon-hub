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
 * In Slice 2, additional props (hexes, pois, effectiveView, onSelectEntity) will
 * be added here as the marker layer is wired up.
 *
 * REQ-WM-03 (ssr:false requirement).
 */

import dynamic from 'next/dynamic';

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
}

export function MapClientWrapper({ supabaseUrl }: MapClientWrapperProps) {
  return <WorldMapLeafletDynamic supabaseUrl={supabaseUrl} />;
}
