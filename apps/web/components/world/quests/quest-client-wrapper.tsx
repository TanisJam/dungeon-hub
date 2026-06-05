'use client';

// QuestClientWrapper — CLIENT RSC boundary for Quests.
//
// ADR-2: This wrapper exists specifically because render slots (renderRow, renderDetail,
// renderForm) and Server Action callbacks cannot be passed as props from a Server Component
// across the RSC→Client boundary. Function components are not serializable.
//
// This component receives only serializable props from the Server Component (worldId,
// effectiveView, initialQuests) and wires up all the typed slot functions internally
// before passing them to WorldEntityShell<QuestRow, QuestRow>.
//
// REQ-QUEST-WEB-PAGE-01, REQ-QUEST-WEB-PAGE-02: quest list + search.
// REQ-QUEST-WEB-PAGE-04: dm-only chip via closed-over effectiveView.

import type { ReactNode } from 'react';
import { WorldEntityShell } from '@/components/world/_shell/world-entity-shell';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { QuestRowView } from './quest-row';
import { QuestDetailView } from './quest-detail';
import { QuestForm } from './quest-form';
import {
  listQuests,
  getQuestDetail,
  createQuest,
  updateQuest,
  deleteQuest,
} from '@/app/codex/quests/actions';
import type { QuestRow, QuestBody } from '@/app/codex/quests/actions';

// ---------------------------------------------------------------------------
// Dependency injection bundle
// ---------------------------------------------------------------------------

export type QuestWrapperActions = {
  listQuests: typeof listQuests;
  getQuestDetail: typeof getQuestDetail;
  createQuest: typeof createQuest;
  updateQuest: typeof updateQuest;
  deleteQuest: typeof deleteQuest;
};

const DEFAULT_QUEST_ACTIONS: QuestWrapperActions = {
  listQuests,
  getQuestDetail,
  createQuest,
  updateQuest,
  deleteQuest,
};

// ---------------------------------------------------------------------------

interface QuestClientWrapperProps {
  worldId: string;
  effectiveView: EffectiveView;
  initialQuests: QuestRow[];
  /** Optional action bundle for catalog/testing; defaults to real server actions. */
  actions?: QuestWrapperActions;
}

export function QuestClientWrapper({
  worldId,
  effectiveView,
  initialQuests,
  actions,
}: QuestClientWrapperProps) {
  const a = actions ?? DEFAULT_QUEST_ACTIONS;

  // ─── Slot: renderRow ────────────────────────────────────────────────────────
  function renderRow(row: QuestRow): ReactNode {
    // Close over effectiveView to pass dm chip visibility
    return <QuestRowView row={row} showDmChip={effectiveView === 'dm'} />;
  }

  // ─── Slot: renderDetail ─────────────────────────────────────────────────────
  function renderDetail(detail: QuestRow, view: EffectiveView): ReactNode {
    return <QuestDetailView detail={detail} effectiveView={view} />;
  }

  // ─── Slot: renderForm (DM-only) ─────────────────────────────────────────────
  function renderForm(
    mode: 'create' | 'edit',
    initial: QuestRow | null,
    onDone: () => void,
  ): ReactNode {
    async function handleSubmit(body: QuestBody) {
      if (mode === 'create') {
        const result = await a.createQuest(worldId, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      } else {
        if (!initial?.id) return { ok: false, error: 'ID de quest desconocido' };
        const result = await a.updateQuest(initial.id, body);
        return { ok: result.ok, error: result.ok ? undefined : (result as { error: string }).error };
      }
    }

    return (
      <QuestForm
        mode={mode}
        initial={initial}
        onSubmit={handleSubmit}
        onDone={onDone}
      />
    );
  }

  // ─── onSearch ───────────────────────────────────────────────────────────────
  async function onSearch(q: string, offset: number) {
    return a.listQuests(worldId, q, offset);
  }

  // ─── onLoadDetail ───────────────────────────────────────────────────────────
  async function onLoadDetail(row: QuestRow) {
    return a.getQuestDetail(row.id);
  }

  // ─── onDelete (DM-only) ─────────────────────────────────────────────────────
  async function onDelete(row: QuestRow) {
    await a.deleteQuest(row.id);
  }

  return (
    <WorldEntityShell<QuestRow, QuestRow>
      items={initialQuests}
      total={initialQuests.length}
      effectiveView={effectiveView}
      searchPlaceholder="Buscar quests…"
      onSearch={onSearch}
      onLoadDetail={onLoadDetail}
      renderRow={renderRow}
      renderDetail={renderDetail}
      renderForm={renderForm}
      onDelete={onDelete}
    />
  );
}
