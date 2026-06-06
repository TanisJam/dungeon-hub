'use client';

// CompleteForm — DM complete+rewards form inside a V3Sheet.
// REQ-DPPMB-COMPLETE-01, REQ-DPPMB-COMPLETE-03, REQ-DPPMB-COMPLETE-04,
// REQ-DPPMB-COMPLETE-05, REQ-DPPMB-COMPLETE-06, REQ-DPPMB-COMPLETE-07.
// ADR-B2: V3Sheet for the complete form (sheet pattern, not a route).
// Mobile-first (375px): submit pinned at bottom via sticky pattern inside V3Sheet.

import { useState } from 'react';
import { V3Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FormLabel } from '@/components/ui/form-label';
import { FormInput } from '@/components/ui/form-input';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import { FormSubmitButton } from '@/components/ui/form-submit-button';
import type { EnrichedParticipant } from '@/app/campanas/[id]/sessions/actions';
import { completeSession } from '@/app/campanas/[id]/sessions/actions';
import { KnowledgeGrantSection, type KnowledgeGrant, type CandidateEntity } from '@/components/codex/knowledge-grant-section';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemRow {
  id: string;
  characterId: string;
  slug: string;
  source: string;
  quantity: string; // kept as string until submit
}

interface WorldChangeRow {
  id: string;
  title: string;
  description: string;
  visibility: 'public' | 'dm-only';
}

export interface CompleteFormProps {
  open: boolean;
  onClose: () => void;
  /** Called on successful complete (after showing recap if desired). */
  onDone: () => void;
  sessionId: string;
  campaignId: string;
  /**
   * Active participants (leftAt IS NULL) — recipient options for item grants.
   * REQ-DPPMB-COMPLETE-03: scoped to ACTIVE participants only.
   */
  participants: Pick<EnrichedParticipant, 'characterId' | 'userId' | 'name' | 'leftAt'>[];
}

// ---------------------------------------------------------------------------
// Error resolution (REQ-DPPMB-COMPLETE-06)
// ---------------------------------------------------------------------------

interface ApiIssue {
  code: string;
  index?: number;
}

function resolveErrors(rawError: string): {
  topLevel?: string;
  itemErrors: Record<number, string>;
} {
  try {
    const issues = JSON.parse(rawError) as ApiIssue[];
    const itemErrors: Record<number, string> = {};
    let topLevel: string | undefined;

    for (const issue of issues) {
      if (issue.code === 'ITEM_REWARD_INVALID_RECIPIENT') {
        const idx = issue.index ?? 0;
        itemErrors[idx] = 'Este personaje no es participante activo.';
      } else if (issue.code === 'ITEM_NOT_FOUND') {
        const idx = issue.index ?? 0;
        itemErrors[idx] = 'Ítem no encontrado.';
      } else if (issue.code === 'INVALID_STATE_TRANSITION') {
        topLevel = 'La sesión no puede completarse en su estado actual.';
      } else {
        topLevel = 'No se pudo completar la sesión. Intentá de nuevo.';
      }
    }

    return { topLevel, itemErrors };
  } catch {
    return {
      topLevel: rawError || 'No se pudo completar la sesión. Intentá de nuevo.',
      itemErrors: {},
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newItemRow(): ItemRow {
  return {
    id: `item-${Math.random().toString(36).slice(2)}`,
    characterId: '',
    slug: '',
    source: '',
    quantity: '1',
  };
}

function newWorldChangeRow(): WorldChangeRow {
  return {
    id: `wc-${Math.random().toString(36).slice(2)}`,
    title: '',
    description: '',
    visibility: 'public',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CompleteForm({
  open,
  onClose,
  onDone,
  sessionId,
  campaignId,
  participants,
}: CompleteFormProps) {
  const [summary, setSummary] = useState('');
  const [xpPerPlayer, setXpPerPlayer] = useState('');
  const [goldPerPlayer, setGoldPerPlayer] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [worldChanges, setWorldChanges] = useState<WorldChangeRow[]>([]);
  const [knowledgeGrants, setKnowledgeGrants] = useState<KnowledgeGrant[]>([]);

  // Candidate entities for knowledge grants — Slice 1: DM manually adds slugs.
  // TODO: auto-populate from session_events in a follow-up slice (codex-knowledge #1946).
  const candidateEntities: CandidateEntity[] = [];

  const [submitting, setSubmitting] = useState(false);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [itemErrors, setItemErrors] = useState<Record<number, string>>({});

  // Only active participants are eligible recipients.
  const activeParticipants = participants.filter((p) => p.leftAt === null);

  // --- Item rows management ---

  function addItemRow() {
    setItems((prev) => [...prev, newItemRow()]);
  }

  function removeItemRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setItemErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  // --- World changes management ---

  function addWorldChangeRow() {
    setWorldChanges((prev) => [...prev, newWorldChangeRow()]);
  }

  function removeWorldChangeRow(index: number) {
    setWorldChanges((prev) => prev.filter((_, i) => i !== index));
  }

  function updateWorldChange(
    index: number,
    field: keyof WorldChangeRow,
    value: string,
  ) {
    setWorldChanges((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  }

  // --- Submit ---

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTopLevelError(null);
    setItemErrors({});
    setSubmitting(true);

    // Build the body with exact Zod field names (REQ-DPPMB-COMPLETE-03).
    const xp = xpPerPlayer !== '' ? Number(xpPerPlayer) : undefined;
    const gold = goldPerPlayer !== '' ? Number(goldPerPlayer) : undefined;

    const validItems = items
      .filter((row) => row.characterId && row.slug && row.source)
      .map((row) => ({
        characterId: row.characterId,
        slug: row.slug,
        source: row.source,
        ...(row.quantity !== '' && row.quantity !== '1'
          ? { quantity: Number(row.quantity) }
          : row.quantity !== ''
            ? { quantity: Number(row.quantity) }
            : {}),
      }));

    const validWorldChanges = worldChanges
      .filter((row) => row.title.trim())
      .map((row) => ({
        title: row.title.trim(),
        ...(row.description.trim() ? { description: row.description.trim() } : {}),
        ...(row.visibility !== 'public' ? { visibility: row.visibility } : { visibility: row.visibility }),
      }));

    const rewards: {
      xpPerPlayer?: number;
      goldPerPlayer?: number;
      items?: typeof validItems;
    } = {};
    if (xp !== undefined) rewards.xpPerPlayer = xp;
    if (gold !== undefined) rewards.goldPerPlayer = gold;
    if (validItems.length > 0) rewards.items = validItems;

    const body = {
      ...(summary.trim() ? { summary: summary.trim() } : {}),
      ...(Object.keys(rewards).length > 0 ? { rewards } : {}),
      ...(validWorldChanges.length > 0 ? { worldChanges: validWorldChanges } : {}),
      // codex-knowledge B-3: optional knowledge grants bulk-unlock.
      // REQ-CK-UNLOCK-03: knowledgeGrants[] inside the complete tx.
      ...(knowledgeGrants.length > 0 ? {
        knowledgeGrants: knowledgeGrants.map((g) => ({
          characterId: g.characterId,
          kind: g.kind,
          refKey: g.refKey,
          refSource: g.refSource,
        })),
      } : {}),
    };

    const result = await completeSession(sessionId, campaignId, body);
    setSubmitting(false);

    if (result.ok) {
      onDone();
    } else {
      // REQ-DPPMB-COMPLETE-06: parse error codes.
      const { topLevel, itemErrors: rowErrors } = resolveErrors(result.error ?? '');
      setTopLevelError(topLevel ?? null);
      setItemErrors(rowErrors);
      // Do NOT close the form on row errors (spec: inline row error, form stays open).
    }
  }

  return (
    <V3Sheet open={open} onClose={onClose} title="Completar sesión">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* ── Top-level error ── */}
        <FormErrorAlert message={topLevelError} />

        {/* ── REQ-DPPMB-COMPLETE-04: read-only participant summary ── */}
        {activeParticipants.length > 0 && (
          <section aria-label="Participantes activos">
            <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Participantes
            </p>
            <ul className="flex flex-wrap gap-2">
              {activeParticipants.map((p) => (
                <li
                  key={p.characterId}
                  className="rounded-md bg-surface-raised px-2.5 py-1 font-sans text-xs font-medium text-ink"
                >
                  {p.name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Summary (optional) ── */}
        <div>
          <FormLabel htmlFor="complete-summary">Resumen de sesión</FormLabel>
          <FormInput
            id="complete-summary"
            multiline
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Narrá brevemente lo que ocurrió…"
            rows={3}
          />
        </div>

        {/* ── XP per player ── */}
        <div>
          <FormLabel htmlFor="complete-xp">XP por jugador</FormLabel>
          <FormInput
            id="complete-xp"
            type="number"
            value={xpPerPlayer}
            onChange={(e) => setXpPerPlayer(e.target.value)}
            placeholder="0"
          />
        </div>

        {/* ── Gold per player ── */}
        <div>
          <FormLabel htmlFor="complete-gold">Oro por jugador</FormLabel>
          <FormInput
            id="complete-gold"
            type="number"
            value={goldPerPlayer}
            onChange={(e) => setGoldPerPlayer(e.target.value)}
            placeholder="0"
          />
        </div>

        {/* ── Item reward rows ── REQ-DPPMB-COMPLETE-03 ── */}
        <section aria-label="Ítems por personaje">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Ítems individuales
            </p>
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={addItemRow}
            >
              Agregar ítem
            </Button>
          </div>

          {items.map((row, index) => (
            <div
              key={row.id}
              data-testid={`item-row-${index}`}
              className="mb-3 rounded-md border border-line bg-surface-raised p-3"
            >
              {/* Recipient selector — scoped to ACTIVE participants (REQ-DPPMB-COMPLETE-03) */}
              <div className="mb-2">
                <label
                  htmlFor={`item-recipient-${index}`}
                  className="block font-sans text-xs text-ink-mute"
                >
                  Personaje
                </label>
                <select
                  id={`item-recipient-${index}`}
                  data-testid={`item-row-${index}-recipient`}
                  value={row.characterId}
                  onChange={(e) => updateItem(index, 'characterId', e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink"
                >
                  <option value="">— Elegir personaje —</option>
                  {activeParticipants.map((p) => (
                    <option key={p.characterId} value={p.characterId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Slug */}
              <div className="mb-2">
                <label
                  htmlFor={`item-slug-${index}`}
                  className="block font-sans text-xs text-ink-mute"
                >
                  Slug del ítem
                </label>
                <input
                  id={`item-slug-${index}`}
                  data-testid={`item-row-${index}-slug`}
                  type="text"
                  value={row.slug}
                  onChange={(e) => updateItem(index, 'slug', e.target.value)}
                  placeholder="ej. potion-healing"
                  className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink"
                />
              </div>

              {/* Source */}
              <div className="mb-2">
                <label
                  htmlFor={`item-source-${index}`}
                  className="block font-sans text-xs text-ink-mute"
                >
                  Fuente
                </label>
                <input
                  id={`item-source-${index}`}
                  data-testid={`item-row-${index}-source`}
                  type="text"
                  value={row.source}
                  onChange={(e) => updateItem(index, 'source', e.target.value)}
                  placeholder="ej. PHB"
                  className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink"
                />
              </div>

              {/* Quantity */}
              <div className="mb-2">
                <label
                  htmlFor={`item-qty-${index}`}
                  className="block font-sans text-xs text-ink-mute"
                >
                  Cantidad
                </label>
                <input
                  id={`item-qty-${index}`}
                  data-testid={`item-row-${index}-quantity`}
                  type="number"
                  min="1"
                  max="999"
                  value={row.quantity}
                  onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink"
                />
              </div>

              {/* Inline row error — REQ-DPPMB-COMPLETE-06 */}
              {itemErrors[index] && (
                <p className="mt-1 font-sans text-xs text-red-600" role="alert">
                  {itemErrors[index]}
                </p>
              )}

              {/* Remove row */}
              <button
                type="button"
                aria-label={`Eliminar ítem ${index}`}
                onClick={() => removeItemRow(index)}
                className="mt-1 font-sans text-xs text-ink-soft underline-offset-2 hover:underline"
              >
                Eliminar
              </button>
            </div>
          ))}
        </section>

        {/* ── World changes rows ── REQ-DPPMB-COMPLETE-03 ── */}
        <section aria-label="Cambios en el mundo">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ink-mute">
              Cambios en el mundo
            </p>
            <Button
              type="button"
              tone="ghost"
              size="sm"
              onClick={addWorldChangeRow}
            >
              Agregar cambio
            </Button>
          </div>

          {worldChanges.map((row, index) => (
            <div
              key={row.id}
              data-testid={`world-change-row-${index}`}
              className="mb-3 rounded-md border border-line bg-surface-raised p-3"
            >
              {/* Title (required) */}
              <div className="mb-2">
                <label
                  htmlFor={`wc-title-${index}`}
                  className="block font-sans text-xs text-ink-mute"
                >
                  Título <span aria-hidden="true">*</span>
                </label>
                <input
                  id={`wc-title-${index}`}
                  data-testid={`world-change-row-${index}-title`}
                  type="text"
                  value={row.title}
                  onChange={(e) => updateWorldChange(index, 'title', e.target.value)}
                  placeholder="Ej. La ciudad cayó"
                  className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink"
                />
              </div>

              {/* Description (optional) */}
              <div className="mb-2">
                <label
                  htmlFor={`wc-desc-${index}`}
                  className="block font-sans text-xs text-ink-mute"
                >
                  Descripción
                </label>
                <textarea
                  id={`wc-desc-${index}`}
                  data-testid={`world-change-row-${index}-description`}
                  value={row.description}
                  onChange={(e) => updateWorldChange(index, 'description', e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink"
                />
              </div>

              {/* Visibility */}
              <div className="mb-2">
                <label
                  htmlFor={`wc-vis-${index}`}
                  className="block font-sans text-xs text-ink-mute"
                >
                  Visibilidad
                </label>
                <select
                  id={`wc-vis-${index}`}
                  data-testid={`world-change-row-${index}-visibility`}
                  value={row.visibility}
                  onChange={(e) =>
                    updateWorldChange(
                      index,
                      'visibility',
                      e.target.value as 'public' | 'dm-only',
                    )
                  }
                  className="mt-1 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink"
                >
                  <option value="public">Público</option>
                  <option value="dm-only">Solo DM</option>
                </select>
              </div>

              {/* Remove row */}
              <button
                type="button"
                aria-label={`Eliminar cambio ${index}`}
                onClick={() => removeWorldChangeRow(index)}
                className="mt-1 font-sans text-xs text-ink-soft underline-offset-2 hover:underline"
              >
                Eliminar
              </button>
            </div>
          ))}
        </section>

        {/* ── Conocimiento a otorgar — codex-knowledge B-3 REQ-CK-UNLOCK-08 ── */}
        <KnowledgeGrantSection
          participants={activeParticipants}
          candidateEntities={candidateEntities}
          onGrantsChange={setKnowledgeGrants}
        />

        {/* ── Submit — REQ-DPPMB-COMPLETE-07: sticky at bottom via V3Sheet overflow ── */}
        <div className="sticky bottom-0 bg-surface py-2">
          <FormSubmitButton
            pending={submitting}
            idleLabel="Cerrar sesión y repartir"
            pendingLabel="Cerrando…"
          />
        </div>
      </form>
    </V3Sheet>
  );
}
