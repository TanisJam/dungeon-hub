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
 * Slice 3: placement added for DM tap-to-place mode (REQ-PLACE-TAP-02/03).
 *
 * REQ-WM-03 (ssr:false requirement).
 */

import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { PoiRow } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';

const WorldMapLeafletDynamic = dynamic(
  () => import('./world-map-leaflet').then((m) => ({ default: m.WorldMapLeaflet })),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-x-0 top-[120px] z-10 flex items-center justify-center bg-paper"
        style={{ bottom: 'calc(73px + env(safe-area-inset-bottom, 0px))' }}
        data-testid="map-container"
      >
        <p className="text-sm text-ink-muted">Cargando mapa…</p>
      </div>
    ),
  },
);

/** Place-mode target — the POI being located on the map. */
export interface PlacementTarget {
  id: string;
  name: string;
}

interface MapClientWrapperProps {
  /** Supabase Storage base URL (NEXT_PUBLIC_SUPABASE_URL from lib/env.ts). */
  supabaseUrl: string;
  /** World-scope POI list (SSR-fetched, server-filtered for role). REQ-POI-MARKER-01. */
  pois: PoiRow[];
  /** Effective view for the DM-notes gate inside PoiDetail. REQ-POI-MARKER-02. */
  effectiveView: EffectiveView;
  /**
   * Place-mode target: the POI currently being placed on the map.
   * Non-null iff ?place=<id> is in the URL and the id resolves to a known POI.
   * REQ-PLACE-TAP-02, REQ-PLACE-TAP-03.
   */
  placement: PlacementTarget | null;
}

/**
 * PlaceModeBanner — fixed overlay shown during tap-to-place mode.
 *
 * REQ-PLACE-TAP-03: "Tocá el mapa para ubicar {name}" + Cancelar button.
 * Cancelar strips ?place from the URL (router.push removes the param).
 * Must be visible at 375px viewport — full-width, adequate padding.
 */
function PlaceModeBanner({ name, onCancel }: { name: string; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-x-0 top-[120px] z-20 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-surface shadow-md"
      data-testid="place-mode-banner"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">Tocá el mapa para ubicar {name}</p>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-[44px] min-w-[44px] rounded-md border border-surface/30 px-3 py-1 text-sm font-medium text-surface transition-colors hover:bg-surface/10"
        aria-label="Cancelar colocación en mapa"
      >
        Cancelar
      </button>
    </div>
  );
}

export function MapClientWrapper({ supabaseUrl, pois, effectiveView, placement }: MapClientWrapperProps) {
  const router = useRouter();

  function handleCancel() {
    router.push('?view=mapa');
  }

  return (
    <>
      {placement && (
        <PlaceModeBanner
          name={placement.name}
          onCancel={handleCancel}
        />
      )}
      <WorldMapLeafletDynamic
        supabaseUrl={supabaseUrl}
        pois={pois}
        effectiveView={effectiveView}
        placement={placement}
      />
    </>
  );
}
