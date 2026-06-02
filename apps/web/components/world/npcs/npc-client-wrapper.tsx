'use client';

// NpcClientWrapper — CLIENT RSC boundary for NPCs.
//
// ADR-2: Like FactionClientWrapper, this wrapper exists because render slots and
// Server Action callbacks cannot be passed from a Server Component across the
// RSC→Client boundary. Function components are not serializable.
//
// Wires typed slots to WorldEntityShell<NpcRow, NpcRow>.
// NpcDetailView needs worldId + worldFactions for N:M membership chips;
// these are captured in the wrapper closure and passed via renderDetail.
//
// REQ-NPC-01, REQ-NPC-02, REQ-GATE-01.

import type { ReactNode } from 'react';
import { WorldEntityShell } from '@/components/world/_shell/world-entity-shell';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { NpcRowView } from './npc-row';
import { NpcDetailView } from './npc-detail';
import { NpcForm } from './npc-form';
import {
  listNpcs,
  getNpcDetail,
  createNpc,
  updateNpc,
  deleteNpc,
} from '@/app/codex/actions';
import type { NpcRow, NpcBody, FactionRow } from '@/app/codex/actions';

interface NpcClientWrapperProps {
  worldId: string;
  effectiveView: EffectiveView;
  initialNpcs: NpcRow[];
  /** All factions in the active world — passed for the N:M picker. */
  worldFactions: FactionRow[];
}

export function NpcClientWrapper({
  worldId,
  effectiveView,
  initialNpcs,
  worldFactions,
}: NpcClientWrapperProps) {
  // ─── Slot: renderRow ────────────────────────────────────────────────────────
  function renderRow(row: NpcRow): ReactNode {
    return <NpcRowView row={row} />;
  }

  // ─── Slot: renderDetail ─────────────────────────────────────────────────────
  // worldId and worldFactions are captured from the wrapper closure — not serializable as
  // props from the Server Component, so they live here inside the client boundary.
  function renderDetail(detail: NpcRow, view: EffectiveView): ReactNode {
    return (
      <NpcDetailView
        detail={detail}
        effectiveView={view}
        worldId={worldId}
        worldFactions={worldFactions}
      />
    );
  }

  // ─── Slot: renderForm (DM-only) ─────────────────────────────────────────────
  function renderForm(
    mode: 'create' | 'edit',
    initial: NpcRow | null,
    onDone: () => void,
  ): ReactNode {
    async function handleSubmit(body: NpcBody) {
      if (mode === 'create') {
        const result = await createNpc(worldId, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      } else {
        if (!initial?.id) return { ok: false, error: 'ID de NPC desconocido' };
        const result = await updateNpc(initial.id, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      }
    }

    return (
      <NpcForm
        mode={mode}
        initial={initial}
        onSubmit={handleSubmit}
        onDone={onDone}
      />
    );
  }

  // ─── onSearch ───────────────────────────────────────────────────────────────
  async function onSearch(q: string, offset: number) {
    return listNpcs(worldId, q, offset);
  }

  // ─── onLoadDetail ───────────────────────────────────────────────────────────
  async function onLoadDetail(row: NpcRow) {
    return getNpcDetail(row.id);
  }

  // ─── onDelete (DM-only) ─────────────────────────────────────────────────────
  async function onDelete(row: NpcRow) {
    await deleteNpc(row.id);
  }

  return (
    <WorldEntityShell<NpcRow, NpcRow>
      items={initialNpcs}
      total={initialNpcs.length}
      effectiveView={effectiveView}
      searchPlaceholder="Buscar NPCs…"
      onSearch={onSearch}
      onLoadDetail={onLoadDetail}
      renderRow={renderRow}
      renderDetail={renderDetail}
      renderForm={renderForm}
      onDelete={onDelete}
    />
  );
}
