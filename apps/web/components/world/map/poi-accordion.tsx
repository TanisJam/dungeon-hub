'use client';

// PoiAccordion — inline lazy accordion for a single hex's POIs.
//
// CRITICAL: listPois is called ONLY when the user expands the accordion for that
// specific hex — NOT at page load. This prevents the N+1 problem described in
// REQ-MAP-01 Scenario: "POI accordion does not N+1 on load".
//
// Loaded POIs are cached in parent state (Map<hexId, PoiRow[]>) so re-expanding
// the same hex does NOT re-fetch. The `onLoadPois` prop wraps the listPois Server
// Action and is called once per hexId.
//
// REQ-MAP-01, REQ-GATE-01: DM sees all POIs + dmNotes + CRUD; player sees filtered
// POIs (status != 'unknown') without dmNotes or controls.

import { useState } from 'react';
import type { PoiRow, PoiStatus, PoiBody } from '@/app/mapa/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';

const POI_STATUS_LABEL: Record<PoiStatus, string> = {
  unknown: 'Desconocido',
  discovered: 'Descubierto',
  cleared: 'Despejado',
};

const POI_STATUS_STYLE: Record<PoiStatus, string> = {
  unknown: 'bg-stone-100 text-stone-600',
  discovered: 'bg-blue-100 text-blue-700',
  cleared: 'bg-green-100 text-green-700',
};

interface PoiFormState {
  open: boolean;
  mode: 'create' | 'edit';
  initial: PoiRow | null;
}

interface PoiAccordionProps {
  hexId: string;
  effectiveView: EffectiveView;
  /** Called once per hexId on first expand. Must NOT be called at mount. */
  onLoadPois: (hexId: string) => Promise<PoiRow[]>;
  /** DM-only: create a POI under this hex. */
  onCreatePoi: (hexId: string, body: PoiBody) => Promise<{ ok: boolean; error?: string }>;
  /** DM-only: update a POI. */
  onUpdatePoi: (poiId: string, body: Partial<PoiBody>) => Promise<{ ok: boolean; error?: string }>;
  /** DM-only: delete a POI. */
  onDeletePoi: (poiId: string) => Promise<void>;
}

export function PoiAccordion({
  hexId,
  effectiveView,
  onLoadPois,
  onCreatePoi,
  onUpdatePoi,
  onDeletePoi,
}: PoiAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const [pois, setPois] = useState<PoiRow[] | null>(null); // null = not yet loaded
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<PoiFormState>({ open: false, mode: 'create', initial: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDmNotes, setFormDmNotes] = useState('');
  const [formStatus, setFormStatus] = useState<PoiStatus>('unknown');
  const [submitting, setSubmitting] = useState(false);

  const isDM = effectiveView === 'dm';

  // ─── Toggle accordion ────────────────────────────────────────────────────────
  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // Only load if not yet cached — REQ-MAP-01: lazy, not at page load.
    if (pois === null) {
      setLoading(true);
      const loaded = await onLoadPois(hexId);
      setPois(loaded);
      setLoading(false);
    }
  }

  // ─── Open create/edit form ────────────────────────────────────────────────────
  function openCreate() {
    setFormName('');
    setFormDesc('');
    setFormDmNotes('');
    setFormStatus('unknown');
    setFormError(null);
    setForm({ open: true, mode: 'create', initial: null });
  }

  function openEdit(poi: PoiRow) {
    setFormName(poi.name);
    setFormDesc(poi.description ?? '');
    setFormDmNotes(poi.dmNotes ?? '');
    setFormStatus(poi.status);
    setFormError(null);
    setForm({ open: true, mode: 'edit', initial: poi });
  }

  function closeForm() {
    setForm({ open: false, mode: 'create', initial: null });
    setFormError(null);
  }

  // ─── Submit create/edit ───────────────────────────────────────────────────────
  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    setSubmitting(true);
    setFormError(null);

    const body: PoiBody = {
      name: formName.trim(),
      ...(formDesc.trim() && { description: formDesc.trim() }),
      ...(formDmNotes.trim() && { dmNotes: formDmNotes.trim() }),
      status: formStatus,
    };

    try {
      if (form.mode === 'create') {
        const result = await onCreatePoi(hexId, body);
        if (result.ok) {
          // Reload POIs for this hex after create
          const refreshed = await onLoadPois(hexId);
          setPois(refreshed);
          closeForm();
        } else {
          setFormError(result.error ?? 'Error al crear');
        }
      } else if (form.initial) {
        const result = await onUpdatePoi(form.initial.id, body);
        if (result.ok) {
          const refreshed = await onLoadPois(hexId);
          setPois(refreshed);
          closeForm();
        } else {
          setFormError(result.error ?? 'Error al guardar');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Delete POI ───────────────────────────────────────────────────────────────
  async function handleDelete(poi: PoiRow) {
    await onDeletePoi(poi.id);
    const refreshed = await onLoadPois(hexId);
    setPois(refreshed);
  }

  // Player-filtered POIs (DM sees all; player sees only discovered/cleared)
  const visiblePois = pois
    ? isDM
      ? pois
      : pois.filter((p) => p.status !== 'unknown')
    : [];

  return (
    <div className="border-t border-line/50">
      {/* Expand toggle */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-label="Ver puntos de interés"
        onClick={handleToggle}
        className="flex min-h-[44px] w-full items-center justify-between bg-paper-soft px-4 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-paper"
      >
        <span>Puntos de interés (POIs)</span>
        <span aria-hidden="true" className="ml-2 text-xs">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Accordion content */}
      {expanded && (
        <div className="px-4 py-3">
          {loading && (
            <p className="py-2 text-center text-xs text-ink-soft" aria-live="polite">
              Cargando POIs…
            </p>
          )}

          {!loading && pois !== null && (
            <>
              {visiblePois.length === 0 ? (
                <p className="py-2 text-center text-xs text-ink-soft">
                  {isDM ? 'Sin POIs registrados.' : 'Sin puntos de interés disponibles.'}
                </p>
              ) : (
                <ul className="divide-y divide-line/50">
                  {visiblePois.map((poi) => (
                    <li key={poi.id} className="py-2">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-ink">{poi.name}</p>
                            <span
                              className={[
                                'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                                POI_STATUS_STYLE[poi.status] ?? 'bg-stone-100 text-stone-600',
                              ].join(' ')}
                            >
                              {POI_STATUS_LABEL[poi.status] ?? poi.status}
                            </span>
                          </div>
                          {poi.description && (
                            <p className="mt-0.5 text-xs text-ink-soft line-clamp-2">
                              {poi.description}
                            </p>
                          )}
                          {/* DM notes — absent for players (REQ-GATE-01) */}
                          {isDM && poi.dmNotes && (
                            <p className="mt-0.5 text-xs text-amber-700 italic">
                              DM: {poi.dmNotes}
                            </p>
                          )}
                        </div>

                        {/* DM controls — absent for players (REQ-GATE-01) */}
                        {isDM && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(poi)}
                              aria-label={`Editar POI ${poi.name}`}
                              className="min-h-[44px] min-w-[44px] rounded-md border border-line bg-paper-soft px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-paper"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(poi)}
                              aria-label={`Eliminar POI ${poi.name}`}
                              className="min-h-[44px] min-w-[44px] rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* DM add POI button — absent for players (REQ-GATE-01) */}
              {isDM && !form.open && (
                <button
                  type="button"
                  onClick={openCreate}
                  aria-label="Añadir POI"
                  className="mt-3 min-h-[44px] w-full rounded-md border border-dashed border-line bg-paper-soft px-4 py-2 text-xs font-medium text-ink-soft transition-colors hover:bg-paper hover:text-ink"
                >
                  + Añadir POI
                </button>
              )}

              {/* Inline create/edit form — DM only */}
              {isDM && form.open && (
                <form onSubmit={handleFormSubmit} className="mt-3 space-y-3 rounded-md border border-line bg-paper-soft p-3">
                  <p className="text-xs font-semibold text-ink">
                    {form.mode === 'create' ? 'Nuevo POI' : 'Editar POI'}
                  </p>

                  <div>
                    <label htmlFor={`poi-name-${hexId}`} className="block text-xs text-ink-soft">
                      Nombre *
                    </label>
                    <input
                      id={`poi-name-${hexId}`}
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                    />
                  </div>

                  <div>
                    <label htmlFor={`poi-desc-${hexId}`} className="block text-xs text-ink-soft">
                      Descripción
                    </label>
                    <textarea
                      id={`poi-desc-${hexId}`}
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                    />
                  </div>

                  <div>
                    <label htmlFor={`poi-dm-${hexId}`} className="block text-xs text-ink-soft">
                      Notas DM
                    </label>
                    <textarea
                      id={`poi-dm-${hexId}`}
                      value={formDmNotes}
                      onChange={(e) => setFormDmNotes(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                    />
                  </div>

                  <div>
                    <label htmlFor={`poi-status-${hexId}`} className="block text-xs text-ink-soft">
                      Estado
                    </label>
                    <select
                      id={`poi-status-${hexId}`}
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as PoiStatus)}
                      className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                    >
                      <option value="unknown">Desconocido</option>
                      <option value="discovered">Descubierto</option>
                      <option value="cleared">Despejado</option>
                    </select>
                  </div>

                  {formError && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">
                      {formError}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={submitting || !formName.trim()}
                      className="min-h-[44px] flex-1 rounded-md bg-ink px-3 py-2 text-xs font-medium text-surface disabled:opacity-50"
                    >
                      {submitting ? 'Guardando…' : form.mode === 'create' ? 'Crear POI' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      onClick={closeForm}
                      className="min-h-[44px] flex-1 rounded-md border border-line bg-paper-soft px-3 py-2 text-xs font-medium text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
