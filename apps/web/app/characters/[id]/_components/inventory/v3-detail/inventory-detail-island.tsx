'use client';

/**
 * InventoryDetailIsland — client island.
 *
 * Owns open/close state + detail cache + event delegation.
 * Single root onClick captures bubbled events from server-rendered
 * <button data-instance-id> rows (DBE1 event delegation).
 *
 * Reqs: WIDI-ISLAND-01 (spec #1070)
 * Design: DBE1 (event delegation), DBE2 (InventoryRow as button), DB5 (state lift).
 *
 * Data flow:
 *   1. Row button tap → event bubbles → island root onClick
 *   2. Island reads data-instance-id from closest [data-instance-id] ancestor
 *   3. Cache check → HIT: render immediately; MISS: fetch via Server Action
 *   4. V3Sheet mounts with InventoryDetailShell
 *   5. Sheet close → openInstanceId = null
 *
 * FIX 2: replaced raw client fetch (broken: relative URL + no auth header → 404/401)
 * with fetchInventoryDetail Server Action (server-side auth, correct Fastify base URL).
 */
import { useState, useRef, useCallback, type ReactNode, type MouseEvent } from 'react';
import type { InventoryDetailResponse } from '@/lib/sheet-types';
import { V3Sheet } from '@/components/ui/sheet';
import { InventoryDetailShell } from './inventory-detail-shell';
import { fetchInventoryDetail } from '../../../actions';

interface InventoryDetailIslandProps {
  characterId: string;
  children: ReactNode;
}

export function InventoryDetailIsland({ characterId, children }: InventoryDetailIslandProps) {
  const [openInstanceId, setOpenInstanceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailCacheRef = useRef<Map<string, InventoryDetailResponse>>(new Map());

  const fetchDetail = useCallback(
    async (instanceId: string) => {
      setLoading(true);
      setError(null);
      setOpenInstanceId(instanceId);

      const result = await fetchInventoryDetail(characterId, instanceId);
      if (result.ok) {
        detailCacheRef.current.set(instanceId, result.detail);
      } else {
        setError(result.error);
      }
      setLoading(false);
    },
    [characterId],
  );

  const handleDelegatedClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>('[data-instance-id]');
      if (!row) return;

      const instanceId = row.getAttribute('data-instance-id');
      if (!instanceId) return;

      if (detailCacheRef.current.has(instanceId)) {
        // Cache hit — render immediately
        setError(null);
        setOpenInstanceId(instanceId);
        return;
      }

      // Cache miss — fetch
      void fetchDetail(instanceId);
    },
    [fetchDetail],
  );

  const handleClose = useCallback(() => {
    setOpenInstanceId(null);
    setError(null);
  }, []);

  const currentDetail = openInstanceId ? (detailCacheRef.current.get(openInstanceId) ?? null) : null;

  return (
    <div
      className="inventory-init-detail-root"
      // Non-interactive delegation root (DBE1, see file doc comment) — the only
      // clicks it ever sees originate from the real <button data-instance-id>
      // rows it wraps, which are already natively keyboard-accessible.
      role="none"
      onClick={handleDelegatedClick}
    >
      {children}

      <V3Sheet
        open={openInstanceId !== null}
        onClose={handleClose}
        title={currentDetail?.displayName ?? (loading ? 'Cargando…' : '')}
        labelledBy={currentDetail ? `detail-name-${currentDetail.instanceId}` : undefined}
      >
        <InventoryDetailShell
          detail={currentDetail}
          characterId={characterId}
          loading={loading}
          error={error}
        />
      </V3Sheet>
    </div>
  );
}
