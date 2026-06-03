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
 * B2: worldId + creating/pendingCoords state for DM tap-to-create (REQ-PWC-CREATE-01..05).
 *     IA: discreet hex-list access control (REQ-PWC-IA-02). MapToggle removed (REQ-PWC-IA-01).
 *
 * REQ-WM-03 (ssr:false requirement).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { PoiRow, PoiBody } from '@/app/mapa/actions';
import { createWorldPoi } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { V3Sheet } from '@/components/ui';
import { PoiForm } from './poi-form';

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
  /**
   * World ID — required for DM tap-to-create (REQ-PWC-CREATE-01).
   * Forwarded to createWorldPoi server action.
   */
  worldId: string;
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
      className="fixed inset-x-0 top-[120px] z-30 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-surface shadow-md"
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

/**
 * CreateModeBanner — fixed overlay shown while DM is in tap-to-create mode.
 *
 * REQ-PWC-CREATE-02: "Tocá el mapa para crear un POI" + Cancelar button.
 * Sibling variant of PlaceModeBanner — does NOT touch PlaceModeBanner's contract.
 */
function CreateModeBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <div
      className="fixed inset-x-0 top-[120px] z-30 flex items-center justify-between gap-3 bg-ink px-4 py-3 text-surface shadow-md"
      data-testid="create-mode-banner"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-medium">Tocá el mapa para crear un POI</p>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-[44px] min-w-[44px] rounded-md border border-surface/30 px-3 py-1 text-sm font-medium text-surface transition-colors hover:bg-surface/10"
        aria-label="Cancelar creación de POI"
      >
        Cancelar
      </button>
    </div>
  );
}

export function MapClientWrapper({
  supabaseUrl,
  pois,
  effectiveView,
  placement,
  worldId,
}: MapClientWrapperProps) {
  const router = useRouter();

  /**
   * Create-mode state (REQ-PWC-CREATE-01, ADR-4).
   * `creating` — true while DM is in tap-to-create mode (banner shown, catcher mounted).
   * `pendingCoords` — set when DM taps the map; opens the V3Sheet create form.
   *
   * Mutual exclusion (REQ-PWC-CREATE-05): FAB is only rendered when !placeActive,
   * and setCreating is guarded below. CreateModeClickCatcher mounts only when creating,
   * PlaceModeClickCatcher mounts only when placement != null. The two modes are
   * structurally disjoint — place is URL-driven, create is local state.
   */
  const [creating, setCreating] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ worldX: number; worldY: number } | null>(null);

  const placeActive = placement != null;

  function handleCancel() {
    router.push('?view=mapa');
  }

  function handleStartCreate() {
    // Guard: cannot enter create-mode while place-mode is active (REQ-PWC-CREATE-05).
    if (placeActive) return;
    setCreating(true);
  }

  function handleCancelCreate() {
    setCreating(false);
    setPendingCoords(null);
  }

  /**
   * Called by CreateModeClickCatcher (via WorldMapLeaflet) when DM taps the map.
   * Sets pendingCoords → opens the V3Sheet create form.
   */
  function handleCreateAt(worldX: number, worldY: number) {
    setPendingCoords({ worldX, worldY });
  }

  /**
   * Submit handler for the PoiForm inside the create sheet.
   * Calls createWorldPoi server action with the worldId + body.
   */
  async function handleCreateSubmit(body: PoiBody) {
    if (!pendingCoords) return { ok: false as const, error: 'Sin coordenadas' };
    const result = await createWorldPoi(worldId, {
      ...body,
      worldX: pendingCoords.worldX,
      worldY: pendingCoords.worldY,
    });
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, error: (result as { error: string }).error };
  }

  function handleCreateDone() {
    router.refresh();
    setPendingCoords(null);
    setCreating(false);
  }

  return (
    <>
      {/* Place-mode banner (Slice 3) */}
      {placement && (
        <PlaceModeBanner
          name={placement.name}
          onCancel={handleCancel}
        />
      )}

      {/* Create-mode banner (REQ-PWC-CREATE-02) — shown while DM is selecting a map point */}
      {creating && !pendingCoords && (
        <CreateModeBanner onCancel={handleCancelCreate} />
      )}

      {/*
       * DM-only create FAB (REQ-PWC-CREATE-01, ADR-6).
       * bottom: calc(...) — inline style (NOT Tailwind bottom-*) for safe-area compliance.
       * right-4: bottom-RIGHT corner, opposite from B1 drawer toggle (bottom-LEFT).
       * Suppressed during place-mode AND during create-mode (REQ-PWC-CREATE-05 + ADR-6).
       * z-30: above map (z-10), below sheets (z-50).
       */}
      {effectiveView === 'dm' && !placeActive && !creating && (
        <button
          type="button"
          onClick={handleStartCreate}
          className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-2xl text-surface shadow-xl"
          style={{ bottom: 'calc(73px + env(safe-area-inset-bottom, 0px) + 16px)' }}
          aria-label="Crear punto de interés"
          data-testid="poi-create-fab"
        >
          +
        </button>
      )}

      {/*
       * Discreet hex-list access control (REQ-PWC-IA-02, ADR-7).
       * Replaces the removed Lista|Mapa toggle bar.
       * TOP-RIGHT: avoids collision with FAB (bottom-right) and B1 drawer toggle (bottom-left).
       * Suppressed during create/place modes (focus clarity).
       * ≥44px tap target. z-30 (same layer as FAB/banners, above map).
       */}
      {!creating && !placeActive && (
        <button
          type="button"
          onClick={() => router.push('?view=lista')}
          className="fixed z-30 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-ink/80 px-3 text-sm font-medium text-surface shadow-md"
          style={{ top: 'calc(56px + 8px)', right: '1rem' }}
          aria-label="Ver lista de hexes"
          data-testid="hex-list-access"
        >
          ☰
        </button>
      )}

      {/*
       * V3Sheet create form (REQ-PWC-CREATE-03).
       * Opens when pendingCoords is set (DM tapped the map in create-mode).
       * PoiForm with mode="create" + initialCoords from tapped point.
       * onDone: refresh markers + exit create-mode.
       */}
      <V3Sheet
        open={pendingCoords != null}
        onClose={handleCancelCreate}
        title="Crear punto de interés"
      >
        {pendingCoords && (
          <PoiForm
            mode="create"
            initial={null}
            initialCoords={pendingCoords}
            onSubmit={handleCreateSubmit}
            onDone={handleCreateDone}
            idPrefix="create"
          />
        )}
      </V3Sheet>

      <WorldMapLeafletDynamic
        supabaseUrl={supabaseUrl}
        pois={pois}
        effectiveView={effectiveView}
        placement={placement}
        creating={creating}
        onCreateAt={handleCreateAt}
      />
    </>
  );
}
