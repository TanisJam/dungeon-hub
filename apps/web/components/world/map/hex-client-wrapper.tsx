'use client';

// HexClientWrapper — CLIENT RSC boundary for Mapa/Ubicaciones.
//
// ADR-2: This wrapper exists because render slots and Server Action callbacks
// cannot be passed as props from a Server Component across the RSC→Client boundary.
// Only serializable props are received from the Server Component; all typed slot
// functions are wired internally before passing to WorldEntityShell<HexRow, HexRow>.
//
// Lazy POI accordion (the KEY difference from other entities):
//   - POIs are NOT loaded at page render (no N+1 — REQ-MAP-01 Scenario 4).
//   - The hex list row renders an inline PoiAccordion.
//   - PoiAccordion calls onLoadPois(hexId) ONLY on first user-expand.
//   - Loaded POIs are cached in `poisCache: Map<hexId, PoiRow[]>` in this component's
//     state. Re-expanding the same hex does NOT re-fetch.
//
// DM gating:
//   - effectiveView='dm': FAB + edit/delete on hexes + POI CRUD + dmNotes visible.
//   - effectiveView='player': all DM affordances absent (REQ-GATE-01).
//
// REQ-MAP-01, REQ-GATE-01.

import { useState, useCallback, type ReactNode } from 'react';
import { WorldEntityShell } from '@/components/world/_shell/world-entity-shell';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { HexRowView } from './hex-row';
import { HexDetailView } from './hex-detail';
import { HexForm } from './hex-form';
import {
  listHexes,
  getHexDetail,
  createHex,
  updateHex,
  deleteHex,
  listPois,
  createPoi,
  updatePoi,
  deletePoi,
} from '@/app/mapa/actions';
import type { HexRow, HexBody, PoiRow, PoiBody } from '@/app/mapa/actions';

interface HexClientWrapperProps {
  worldId: string;
  effectiveView: EffectiveView;
  initialHexes: HexRow[];
}

export function HexClientWrapper({
  worldId,
  effectiveView,
  initialHexes,
}: HexClientWrapperProps) {
  // ─── Lazy POI cache ────────────────────────────────────────────────────────────
  // Cache loaded POIs per hexId. This is a Map so re-expanding doesn't re-fetch.
  // The Map is stored in state so updates (after POI create/delete) propagate correctly.
  // REQ-MAP-01: listPois NOT called at page load.
  const [poisCache, setPoisCache] = useState<Map<string, PoiRow[]>>(new Map());

  // Called by PoiAccordion on first expand (or after mutation to refresh).
  // Uses cache if available; calls Server Action if not.
  const handleLoadPois = useCallback(async (hexId: string): Promise<PoiRow[]> => {
    // For mutations (create/update/delete), the cache is deliberately invalidated
    // by the mutation handlers before calling this — so we always get fresh data
    // after a mutation.
    const loaded = await listPois(hexId);
    setPoisCache((prev) => {
      const next = new Map(prev);
      next.set(hexId, loaded);
      return next;
    });
    return loaded;
  }, []);

  // Invalidate cache for a hex (called by mutation handlers before re-fetch)
  const invalidatePoiCache = useCallback((hexId: string) => {
    setPoisCache((prev) => {
      const next = new Map(prev);
      next.delete(hexId);
      return next;
    });
  }, []);

  // ─── POI CRUD (DM-only) ────────────────────────────────────────────────────────
  const handleCreatePoi = useCallback(
    async (hexId: string, body: PoiBody) => {
      const result = await createPoi(hexId, body);
      if (result.ok) {
        invalidatePoiCache(hexId);
      }
      return {
        ok: result.ok,
        error: result.ok ? undefined : (result as { error: string }).error,
      };
    },
    [invalidatePoiCache],
  );

  const handleUpdatePoi = useCallback(
    async (poiId: string, body: Partial<PoiBody>) => {
      const result = await updatePoi(poiId, body);
      // The PoiAccordion will handle cache refresh after this
      return {
        ok: result.ok,
        error: result.ok ? undefined : (result as { error: string }).error,
      };
    },
    [],
  );

  const handleDeletePoi = useCallback(async (poiId: string) => {
    await deletePoi(poiId);
  }, []);

  // ─── Slot: renderRow ─────────────────────────────────────────────────────────
  // Note: PoiAccordion is NOT placed here because WorldEntityShell wraps each row
  // in a <button> — nesting buttons is invalid HTML. Instead, the PoiAccordion
  // is placed inside renderDetail (the V3Sheet), which is a safe container.
  // The design says "hex row (or the hex detail sheet)" — we use the sheet variant.
  // REQ-MAP-01.
  function renderRow(row: HexRow): ReactNode {
    return <HexRowView row={row} />;
  }

  // ─── Slot: renderDetail ────────────────────────────────────────────────────────
  // The PoiAccordion lives here (inside the V3Sheet detail panel).
  // - Accordion expand calls handleLoadPois(hexId) — lazy, NOT at page load.
  // - Cache is in poisCache Map; re-expanding does not re-fetch.
  // REQ-MAP-01.
  function renderDetail(detail: HexRow, view: EffectiveView): ReactNode {
    return (
      <HexDetailView
        detail={detail}
        effectiveView={view}
        onLoadPois={handleLoadPois}
        onCreatePoi={handleCreatePoi}
        onUpdatePoi={handleUpdatePoi}
        onDeletePoi={handleDeletePoi}
      />
    );
  }

  // ─── Slot: renderForm (DM-only) ────────────────────────────────────────────────
  function renderForm(
    mode: 'create' | 'edit',
    initial: HexRow | null,
    onDone: () => void,
  ): ReactNode {
    async function handleSubmit(body: HexBody) {
      if (mode === 'create') {
        const result = await createHex(worldId, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      } else {
        if (!initial?.id) return { ok: false, error: 'ID de hex desconocido' };
        const result = await updateHex(initial.id, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      }
    }

    return (
      <HexForm
        mode={mode}
        initial={initial}
        onSubmit={handleSubmit}
        onDone={onDone}
      />
    );
  }

  // ─── onSearch ──────────────────────────────────────────────────────────────────
  async function onSearch(q: string, offset: number) {
    return listHexes(worldId, q, offset);
  }

  // ─── onLoadDetail ──────────────────────────────────────────────────────────────
  async function onLoadDetail(row: HexRow) {
    return getHexDetail(row.id);
  }

  // ─── onDelete (DM-only) ────────────────────────────────────────────────────────
  async function onDelete(row: HexRow) {
    await deleteHex(row.id);
  }

  return (
    <WorldEntityShell<HexRow, HexRow>
      items={initialHexes}
      total={initialHexes.length}
      effectiveView={effectiveView}
      searchPlaceholder="Buscar ubicaciones…"
      onSearch={onSearch}
      onLoadDetail={onLoadDetail}
      renderRow={renderRow}
      renderDetail={renderDetail}
      renderForm={renderForm}
      onDelete={onDelete}
    />
  );
}
