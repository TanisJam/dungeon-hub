'use client';

// FactionChipSection — N:M faction membership chips for NPC detail sheet.
//
// REQ-NPC-02: DM view shows chips with ×-detach + "+" add picker.
// Player view shows read-only chips with no add/remove controls.
// After attach/detach the chip list is re-fetched from getNpcDetail (no stale state — Risk 4).
//
// REQ-GATE-01: add/remove controls are ABSENT (not disabled) in player view.
// REQ-GATE-03: chips ≥44px tap targets at 375px.

import { useState } from 'react';
import type { NpcFaction } from '@/app/codex/actions';
import type { FactionRow } from '@/app/codex/actions';
import type { EffectiveView } from '@/components/world/_shell/world-entity-shell';
import { FormErrorAlert } from '@/components/ui/form-error-alert';

interface FactionChipSectionProps {
  /** Current faction memberships for this NPC. */
  factions: NpcFaction[];
  /** All factions in the world (for the picker). */
  worldFactions: FactionRow[];
  effectiveView: EffectiveView;
  /** Called on attach; updates parent chip list on success. */
  onAttach: (factionId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Called on detach; updates parent chip list on success. */
  onDetach: (factionId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function FactionChipSection({
  factions,
  worldFactions,
  effectiveView,
  onAttach,
  onDetach,
}: FactionChipSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null); // factionId being acted on

  const isDM = effectiveView === 'dm';

  // Factions NOT yet attached — available to add
  const attachedIds = new Set(factions.map((f) => f.id));
  const available = worldFactions.filter((f) => !attachedIds.has(f.id));

  async function handleDetach(factionId: string) {
    setLoading(factionId);
    setActionError(null);
    const result = await onDetach(factionId);
    setLoading(null);
    if (!result.ok) {
      setActionError(result.error ?? 'Error al desvincular facción.');
    }
  }

  async function handleAttach(factionId: string) {
    setLoading(factionId);
    setActionError(null);
    const result = await onAttach(factionId);
    setLoading(null);
    if (!result.ok) {
      setActionError(result.error ?? 'Error al vincular facción.');
    }
    setPickerOpen(false);
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Facciones
      </p>

      {/* Error message */}
      {actionError && (
        <div className="mb-2">
          <FormErrorAlert message={actionError} />
        </div>
      )}

      {/* Chip list */}
      <div className="flex flex-wrap gap-2">
        {factions.length === 0 && (
          <span className="text-xs text-ink-soft">Sin facciones asociadas.</span>
        )}

        {factions.map((faction) => (
          <div
            key={faction.id}
            className="flex min-h-[44px] items-center gap-1 rounded-full border border-line bg-paper-soft px-3 text-sm font-medium text-ink"
          >
            <span>{faction.name}</span>
            {/* DM-only detach control — absent for players (REQ-GATE-01) */}
            {isDM && (
              <button
                type="button"
                aria-label={`Desvincular ${faction.name}`}
                onClick={() => handleDetach(faction.id)}
                disabled={loading === faction.id}
                className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper hover:text-red-600 disabled:opacity-50"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {/* DM-only: "+" to open faction picker — absent for players (REQ-GATE-01) */}
        {isDM && available.length > 0 && (
          <button
            type="button"
            aria-label="Añadir facción"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex min-h-[44px] w-10 items-center justify-center rounded-full border border-dashed border-line bg-paper text-ink-soft transition-colors hover:border-ink hover:text-ink"
          >
            +
          </button>
        )}
      </div>

      {/* Faction picker (DM-only dropdown) */}
      {isDM && pickerOpen && available.length > 0 && (
        <div className="mt-2 rounded-md border border-line bg-paper shadow-sm">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Seleccionar facción
          </p>
          <ul className="divide-y divide-line">
            {available.map((faction) => (
              <li key={faction.id}>
                <button
                  type="button"
                  onClick={() => handleAttach(faction.id)}
                  disabled={loading === faction.id}
                  className="min-h-[44px] w-full px-3 text-left text-sm text-ink transition-colors hover:bg-paper-soft disabled:opacity-50"
                >
                  {faction.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
