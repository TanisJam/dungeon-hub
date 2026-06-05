'use client';

// FactionClientWrapper — CLIENT RSC boundary for Facciones.
//
// ADR-2: This wrapper exists specifically because render slots (renderRow, renderDetail,
// renderForm) and Server Action callbacks cannot be passed as props from a Server Component
// across the RSC→Client boundary. Function components are not serializable.
//
// This component receives only serializable props from the Server Component (worldId,
// effectiveView, initialFactions) and wires up all the typed slot functions internally
// before passing them to WorldEntityShell<FactionRow, FactionRow>.
//
// REQ-FAC-01, REQ-FAC-03, REQ-GATE-01.

import type { ReactNode } from 'react';
import { WorldEntityShell } from '@/components/world/_shell/world-entity-shell';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { FactionRowView } from './faction-row';
import { FactionDetailView } from './faction-detail';
import { FactionForm } from './faction-form';
import {
  listFactions,
  getFactionDetail,
  createFaction,
  updateFaction,
  deleteFaction,
} from '@/app/codex/actions';
import type { FactionRow, FactionBody } from '@/app/codex/actions';

// ---------------------------------------------------------------------------
// Dependency injection bundle
// ---------------------------------------------------------------------------

export type FactionWrapperActions = {
  listFactions: typeof listFactions;
  getFactionDetail: typeof getFactionDetail;
  createFaction: typeof createFaction;
  updateFaction: typeof updateFaction;
  deleteFaction: typeof deleteFaction;
};

const DEFAULT_FACTION_ACTIONS: FactionWrapperActions = {
  listFactions,
  getFactionDetail,
  createFaction,
  updateFaction,
  deleteFaction,
};

// ---------------------------------------------------------------------------

interface FactionClientWrapperProps {
  worldId: string;
  effectiveView: EffectiveView;
  initialFactions: FactionRow[];
  /** Optional action bundle for catalog/testing; defaults to real server actions. */
  actions?: FactionWrapperActions;
}

export function FactionClientWrapper({
  worldId,
  effectiveView,
  initialFactions,
  actions,
}: FactionClientWrapperProps) {
  const a = actions ?? DEFAULT_FACTION_ACTIONS;

  // ─── Slot: renderRow ────────────────────────────────────────────────────────
  function renderRow(row: FactionRow): ReactNode {
    return <FactionRowView row={row} />;
  }

  // ─── Slot: renderDetail ─────────────────────────────────────────────────────
  function renderDetail(detail: FactionRow, view: EffectiveView): ReactNode {
    return <FactionDetailView detail={detail} effectiveView={view} />;
  }

  // ─── Slot: renderForm (DM-only) ─────────────────────────────────────────────
  function renderForm(
    mode: 'create' | 'edit',
    initial: FactionRow | null,
    onDone: () => void,
  ): ReactNode {
    async function handleSubmit(body: FactionBody) {
      if (mode === 'create') {
        const result = await a.createFaction(worldId, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      } else {
        if (!initial?.id) return { ok: false, error: 'ID de facción desconocido' };
        const result = await a.updateFaction(initial.id, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      }
    }

    return (
      <FactionForm
        mode={mode}
        initial={initial}
        onSubmit={handleSubmit}
        onDone={onDone}
      />
    );
  }

  // ─── onSearch ───────────────────────────────────────────────────────────────
  async function onSearch(q: string, offset: number) {
    return a.listFactions(worldId, q, offset);
  }

  // ─── onLoadDetail ───────────────────────────────────────────────────────────
  async function onLoadDetail(row: FactionRow) {
    return a.getFactionDetail(row.id);
  }

  // ─── onDelete (DM-only) ─────────────────────────────────────────────────────
  async function onDelete(row: FactionRow) {
    await a.deleteFaction(row.id);
  }

  return (
    <WorldEntityShell<FactionRow, FactionRow>
      items={initialFactions}
      total={initialFactions.length}
      effectiveView={effectiveView}
      searchPlaceholder="Buscar facciones…"
      onSearch={onSearch}
      onLoadDetail={onLoadDetail}
      renderRow={renderRow}
      renderDetail={renderDetail}
      renderForm={renderForm}
      onDelete={onDelete}
    />
  );
}
