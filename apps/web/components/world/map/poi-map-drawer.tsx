'use client';

/**
 * PoiMapDrawer — collapsible POI list overlay for the Mapa view.
 *
 * NOT a portal, NOT V3Sheet, does NOT lock body scroll (REQ-PML-DRAWER-01).
 * Renders as a fixed-positioned panel INSIDE the WorldMapLeaflet subtree, as
 * a sibling of <MapContainer> (not a descendant — it must NOT call useMap()).
 *
 * Mobile (< md): full-width bottom-sheet, ~55vh, slides down when closed.
 * Desktop (≥ md): left panel, 320px wide, slides left when closed.
 *
 * CRITICAL — responsive transform (ADR-3):
 *   A single translateY does not hide a desktop left panel (it's on the left, not bottom).
 *   Closed state uses Tailwind conditional classes:
 *     mobile: translate-y-full (slides down off screen)
 *     desktop: md:-translate-x-full (slides left off screen)
 *   Combined via: open ? '' : 'translate-y-full md:translate-y-0 md:-translate-x-full'
 *
 * Pointer-events hygiene (ADR-5):
 *   Closed panel is pointer-events-none so it never blocks map pan while off-screen.
 *
 * REQ-PML-DRAWER-01, REQ-PML-DRAWER-03, REQ-PML-LIST-01, REQ-PML-LIST-02, REQ-PML-FLYTO-01.
 *
 * B2: POI_STATUS_STYLE raw-tw-colors removed. Status badges now use <Pill> via POI_STATUS_TONE.
 */

import type { PoiRow } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { Pill } from '@/components/ui/pill';
import { POI_STATUS_LABEL } from './poi-detail';
import { POI_STATUS_TONE } from './status-tones';

export interface PoiMapDrawerProps {
  /** Role-filtered POI list — already server-filtered; drawer just renders it. */
  pois: PoiRow[];
  /** Effective view — accepted for forward-compat; role filter already applied upstream. */
  effectiveView: EffectiveView;
  /** Whether the drawer panel is open. */
  open: boolean;
  /** Called when the user closes the drawer (close button or drag-handle tap). */
  onClose: () => void;
  /** Called when the user taps a placed POI row. Only fires for POIs with coords. */
  onFlyTo: (poi: PoiRow) => void;
}

export function PoiMapDrawer({ pois, open, onClose, onFlyTo }: PoiMapDrawerProps) {
  /**
   * Responsive closed-state transform:
   *   Mobile: translate-y-full slides the bottom-sheet fully below the screen edge.
   *   Desktop (md:): translate-y-0 cancels the vertical slide; -translate-x-full slides left.
   */
  const closedTransform = 'translate-y-full md:translate-y-0 md:-translate-x-full';

  return (
    <div
      className={[
        // Base — fixed panel, z-20 (above map z-10, below toggle z-30 and TabBar z-40)
        'fixed inset-x-0 bottom-0 z-20 flex flex-col',
        // Mobile bottom-sheet shape — fixed half-height sheet (not content-hugging)
        'h-[55vh] w-full rounded-t-xl',
        // Desktop left-panel shape (overrides mobile above)
        'md:inset-y-0 md:left-0 md:right-auto md:bottom-auto md:h-auto md:w-80 md:rounded-t-none md:rounded-r-xl',
        // Surface
        'bg-surface shadow-xl',
        // Animation
        'transition-transform duration-300 motion-reduce:transition-none',
        // Closed-state: off-screen + no pointer events to avoid blocking map pan
        open ? 'pointer-events-auto' : `pointer-events-none ${closedTransform}`,
      ].join(' ')}
      aria-hidden={!open}
      data-testid="poi-map-drawer"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Sticky header — drag-handle pill + title + close button             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex shrink-0 flex-col items-center px-4 pt-3 pb-2">
        {/* Drag-handle pill (mobile tap-to-close affordance) */}
        <button
          type="button"
          onClick={onClose}
          className="mb-2 h-1.5 w-10 rounded-full bg-ink/20 md:hidden"
          aria-label="Cerrar lista"
        />
        <div className="flex w-full items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Puntos de interés</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink/5"
            aria-label="Cerrar lista"
          >
            {/* Close × glyph */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px w-full shrink-0 bg-ink/10" />

      {/* ------------------------------------------------------------------ */}
      {/* Scrollable POI list body                                            */}
      {/* overflow-y-auto is on the <ul> ONLY — body scroll is NOT locked.   */}
      {/* ------------------------------------------------------------------ */}
      <ul
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(73px + env(safe-area-inset-bottom, 0px))' }}
      >
        {pois.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-ink-muted">
            No hay puntos de interés
          </li>
        ) : (
          pois.map((poi) => <PoiListRow key={poi.id} poi={poi} onFlyTo={onFlyTo} />)
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PoiListRow — single POI list item (placed or null-coord)
// Named distinctly from the imported PoiRow type (data row shape) to avoid
// shadowing it — the two are unrelated concepts that happened to share a name.
// ---------------------------------------------------------------------------

interface PoiRowProps {
  poi: PoiRow;
  onFlyTo: (poi: PoiRow) => void;
}

function PoiListRow({ poi, onFlyTo }: PoiRowProps) {
  const hasCoords = poi.worldX != null && poi.worldY != null;

  const badge = (
    <Pill tone={POI_STATUS_TONE[poi.status] ?? 'stone'} size="sm">
      {POI_STATUS_LABEL[poi.status] ?? poi.status}
    </Pill>
  );

  if (hasCoords) {
    // Placed POI — tappable row that triggers fly-to (REQ-PML-FLYTO-01)
    return (
      <li>
        <button
          type="button"
          className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-ink/5 active:bg-ink/10"
          onClick={() => onFlyTo(poi)}
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{poi.name}</span>
          {badge}
        </button>
      </li>
    );
  }

  // Null-coord POI — non-interactive row + "sin ubicación" hint (REQ-PML-LIST-02)
  // No fly-to, no "Colocar en mapa" button (that is B2 scope)
  return (
    <li className="flex min-h-[44px] cursor-default items-center gap-3 px-4 py-2 opacity-60">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{poi.name}</span>
      {badge}
      <span className="shrink-0 text-xs text-ink-muted">sin ubicación</span>
    </li>
  );
}
