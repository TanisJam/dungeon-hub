'use client';

// REQ-WCA-WEB-UI-01, REQ-WCA-WEB-UI-02 — AttackSheetView pure presentational layer.
// Receives all state as controlled props + callbacks from AttackSheetIsland.
// Mobile-first 375px: all tap targets ≥44px (CLAUDE.md §2).
// PHB p.194-195 — attack roll + damage in a single round-trip.

import { V3Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';
import type { EncounterCombatant } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Step machine for the sheet flow. */
export type AttackStep = 'weapon' | 'target' | 'result';

/** Union of attack outcomes the SA returns. */
export type AttackHitResult = {
  hit: true;
  d20: number;
  total: number;
  targetAc: number;
  rolledDamage: number;
  damageType: string;
  newHp: number;
  crit?: boolean;
};

export type AttackMissResult = {
  hit: false;
  d20: number;
  total: number;
  targetAc: number;
};

export type AttackResult = AttackHitResult | AttackMissResult;

// ─── Props ────────────────────────────────────────────────────────────────────

export type AttackSheetViewProps = {
  /** Whether the sheet is open. */
  open: boolean;
  step: AttackStep;
  selectedWeapon: EnrichedInventoryItem | null;
  attackResult: AttackResult | null;
  attackError: string | null;
  isPending: boolean;
  /** Pre-derived: !isOwnTurn || actionUsed. View just applies it. */
  triggerDisabled: boolean;
  equippedWeapons: EnrichedInventoryItem[];
  npcTargets: EncounterCombatant[];
  onOpen: () => void;
  onClose: () => void;
  onPickWeapon: (weapon: EnrichedInventoryItem) => void;
  onPickTarget: (target: EncounterCombatant) => void;
  onBackToWeapon: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AttackSheetView({
  open,
  step,
  selectedWeapon,
  attackResult,
  attackError,
  isPending,
  triggerDisabled,
  equippedWeapons,
  npcTargets,
  onOpen,
  onClose,
  onPickWeapon,
  onPickTarget,
  onBackToWeapon,
}: AttackSheetViewProps) {
  return (
    <>
      {/* REQ-WCA-WEB-UI-01: full-width ≥44px trigger button */}
      <Button
        tone="ghost"
        aria-label="Atacar"
        disabled={triggerDisabled || isPending}
        onClick={onOpen}
        fullWidth
      >
        Atacar
      </Button>

      <V3Sheet open={open} onClose={onClose} title="Atacar">
        {/* ── Error banner (persists across steps) ─────────────────────────── */}
        <FormErrorAlert message={attackError} className="mb-3" />

        {/* ── Step 1: weapon pick ──────────────────────────────────────────── */}
        {step === 'weapon' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft mb-1">Elegí un arma</p>
            {equippedWeapons.map((weapon) => (
              <button
                key={weapon.instanceId}
                type="button"
                onClick={() => onPickWeapon(weapon)}
                className="w-full min-h-[44px] rounded border border-line text-sm font-medium text-left px-3"
              >
                {weapon.displayName}
              </button>
            ))}
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[44px] rounded text-sm text-ink-soft border border-line mt-2"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* ── Step 2: target pick ──────────────────────────────────────────── */}
        {step === 'target' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft mb-1">
              {selectedWeapon?.displayName} — elegí un objetivo
            </p>
            {npcTargets.length === 0 ? (
              <p className="text-sm text-ink-soft">No hay enemigos disponibles.</p>
            ) : (
              npcTargets.map((npc) => (
                <button
                  key={npc.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => onPickTarget(npc)}
                  className="w-full min-h-[44px] rounded border border-line text-sm font-medium text-left px-3 disabled:opacity-40"
                >
                  {npc.name}
                  <span className="ml-2 text-ink-soft text-xs">HP: {npc.hpCurrent}/{npc.hpMax}</span>
                </button>
              ))
            )}
            <button
              type="button"
              onClick={onBackToWeapon}
              className="w-full min-h-[44px] rounded text-sm text-ink-soft border border-line mt-2"
            >
              Volver
            </button>
          </div>
        )}

        {/* ── Step 3: result display ───────────────────────────────────────── */}
        {step === 'result' && attackResult && (
          <div className="flex flex-col gap-3">
            {/* Hit / Miss headline */}
            <p className="text-lg font-bold text-center">
              {attackResult.hit ? '¡Impacto!' : 'Fallo'}
            </p>

            {/* Roll line: d20 + total vs AC */}
            <div className="text-sm text-center text-ink-soft">
              d20: {attackResult.d20} → total: {attackResult.total} vs CA {attackResult.targetAc}
            </div>

            {/* Damage line (hit only) */}
            {attackResult.hit && (
              <>
                <div className="text-sm text-center">
                  Daño: <span className="font-semibold">{attackResult.rolledDamage}</span>
                  {' '}{attackResult.damageType}
                  {attackResult.crit && <span className="ml-1 text-xs font-bold uppercase">¡Crítico!</span>}
                </div>
                <div className="text-sm text-center text-ink-soft">
                  HP objetivo: <span className="font-semibold">{attackResult.newHp}</span>
                </div>
              </>
            )}

            <Button
              tone="ghost"
              onClick={onClose}
              fullWidth
              className="mt-2"
            >
              Cerrar
            </Button>
          </div>
        )}
      </V3Sheet>
    </>
  );
}
