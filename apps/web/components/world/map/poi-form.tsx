'use client';

// PoiForm — shared, extracted form for creating and editing a POI.
//
// Extracted from poi-accordion.tsx (inline form block).
// REQ-PWC-FORM-01: reusable across the accordion (edit/create) and the
// create-mode V3Sheet (Batch B).
//
// Design (ADR-3): parent owns create-vs-edit divergence via the onSubmit prop.
// PoiForm is pure: renders fields, manages local string state, maps to PoiBody,
// calls onSubmit. The submit label adapts to mode; everything else is identical.

import { useState } from 'react';
import type { PoiRow, PoiStatus, PoiBody } from '@/app/mapa/actions';
import { IMAGE_W, IMAGE_H } from '@/lib/world/map/coords';
import { FormErrorAlert } from '@/components/ui/form-error-alert';

export interface PoiFormProps {
  mode: 'create' | 'edit';
  /** edit: seed all fields from this row; create: null (coords may come from initialCoords) */
  initial: PoiRow | null;
  /** create-mode: pre-fill coord fields from a tapped map location */
  initialCoords?: { worldX: number; worldY: number } | null;
  onSubmit: (body: PoiBody) => Promise<{ ok: boolean; error?: string }>;
  onDone: () => void;
  /** Unique prefix for input ids — accordion passes hexId; sheet passes 'create' */
  idPrefix?: string;
}

export function PoiForm({
  mode,
  initial,
  initialCoords,
  onSubmit,
  onDone,
  idPrefix = 'poi',
}: PoiFormProps) {
  // Seed from initial (edit) or initialCoords (create with tapped coords).
  const [formName, setFormName] = useState(initial?.name ?? '');
  const [formDesc, setFormDesc] = useState(initial?.description ?? '');
  const [formDmNotes, setFormDmNotes] = useState(initial?.dmNotes ?? '');
  const [formStatus, setFormStatus] = useState<PoiStatus>(initial?.status ?? 'unknown');
  // String state for numeric coord inputs — number inputs emit '' on empty, not 0.
  const [formWorldX, setFormWorldX] = useState<string>(
    initial?.worldX?.toString() ?? initialCoords?.worldX?.toString() ?? '',
  );
  const [formWorldY, setFormWorldY] = useState<string>(
    initial?.worldY?.toString() ?? initialCoords?.worldY?.toString() ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    setSubmitting(true);
    setFormError(null);

    // Map coord string state → number | undefined.
    // Empty field = omit from body (leave existing coord unchanged on edit; null on create).
    // Zod .min(0).max() in the API is the backstop for out-of-range — a 400 will surface
    // via formError. We do NOT client-clamp here (contrast with drag/tap which clamp
    // because a gesture has no text field the DM can correct — ADR-4).
    const x = formWorldX.trim() === '' ? undefined : Number(formWorldX);
    const y = formWorldY.trim() === '' ? undefined : Number(formWorldY);

    const body: PoiBody = {
      name: formName.trim(),
      ...(formDesc.trim() && { description: formDesc.trim() }),
      ...(formDmNotes.trim() && { dmNotes: formDmNotes.trim() }),
      status: formStatus,
      ...(x !== undefined && Number.isFinite(x) && { worldX: x }),
      ...(y !== undefined && Number.isFinite(y) && { worldY: y }),
    };

    try {
      const result = await onSubmit(body);
      if (result.ok) {
        onDone();
      } else {
        setFormError(result.error ?? 'Error al guardar');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleFormSubmit} className="mt-3 space-y-3 rounded-md border border-line bg-paper-soft p-3">
      <p className="text-xs font-semibold text-ink">
        {mode === 'create' ? 'Nuevo POI' : 'Editar POI'}
      </p>

      <div>
        <label htmlFor={`poi-name-${idPrefix}`} className="block text-xs text-ink-soft">
          Nombre *
        </label>
        <input
          id={`poi-name-${idPrefix}`}
          type="text"
          required
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      <div>
        <label htmlFor={`poi-desc-${idPrefix}`} className="block text-xs text-ink-soft">
          Descripción
        </label>
        <textarea
          id={`poi-desc-${idPrefix}`}
          value={formDesc}
          onChange={(e) => setFormDesc(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      <div>
        <label htmlFor={`poi-dm-${idPrefix}`} className="block text-xs text-ink-soft">
          Notas DM
        </label>
        <textarea
          id={`poi-dm-${idPrefix}`}
          value={formDmNotes}
          onChange={(e) => setFormDmNotes(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      <div>
        <label htmlFor={`poi-status-${idPrefix}`} className="block text-xs text-ink-soft">
          Estado
        </label>
        <select
          id={`poi-status-${idPrefix}`}
          value={formStatus}
          onChange={(e) => setFormStatus(e.target.value as PoiStatus)}
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        >
          <option value="unknown">Desconocido</option>
          <option value="discovered">Descubierto</option>
          <option value="cleared">Despejado</option>
        </select>
      </div>

      {/*
       * Coord X / Coord Y numeric inputs (REQ-PLACE-FIELDS-01).
       * Optional: empty field = omit from body.
       * min-h-[44px] for mobile touch target compliance (CLAUDE.md §2).
       */}
      <div>
        <label htmlFor={`poi-x-${idPrefix}`} className="block text-xs text-ink-soft">
          Coord X (0–{IMAGE_W})
        </label>
        <input
          id={`poi-x-${idPrefix}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={IMAGE_W}
          step={1}
          value={formWorldX}
          onChange={(e) => setFormWorldX(e.target.value)}
          placeholder="Opcional"
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      <div>
        <label htmlFor={`poi-y-${idPrefix}`} className="block text-xs text-ink-soft">
          Coord Y (0–{IMAGE_H})
        </label>
        <input
          id={`poi-y-${idPrefix}`}
          type="number"
          inputMode="numeric"
          min={0}
          max={IMAGE_H}
          step={1}
          value={formWorldY}
          onChange={(e) => setFormWorldY(e.target.value)}
          placeholder="Opcional"
          className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
        />
      </div>

      <FormErrorAlert message={formError} />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !formName.trim()}
          className="min-h-[44px] flex-1 rounded-md bg-ink px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
        >
          {submitting ? 'Guardando…' : mode === 'create' ? 'Crear POI' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-[44px] flex-1 rounded-md border border-line bg-paper-soft px-3 py-2 text-xs font-medium text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
