'use client';

// REQ-WCA-WEB-UI-01, REQ-WCA-WEB-UI-02 — AttackSheet client island.
// ONE-SHOT weapon attack (PHB p.194-195 — attack roll + damage in a single round-trip).
// Mobile-first 375px: all tap targets ≥44px (CLAUDE.md §2).
// V3Sheet wraps a 3-step state machine: weapon → target → result.
// No optimistic UI. VERSION_CONFLICT → router.refresh() + close (mirrors RageControls).
// PHB p.189-190, 192 — weapon attack costs the Action for the turn.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { V3Sheet } from '@/components/ui/sheet';
import { attackApplyAction } from '@/app/encuentros/[id]/actions';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';
import type { EncounterCombatant } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Step machine for the sheet flow. */
type Step = 'weapon' | 'target' | 'result';

/** Union of attack outcomes the SA returns. */
type AttackHitResult = {
  hit: true;
  d20: number;
  total: number;
  targetAc: number;
  rolledDamage: number;
  damageType: string;
  newHp: number;
  crit?: boolean;
};

type AttackMissResult = {
  hit: false;
  d20: number;
  total: number;
  targetAc: number;
};

type AttackResult = AttackHitResult | AttackMissResult;

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  encounterId: string;
  attackerCombatantId: string;
  /** Equipped weapons from inventoryEnriched (v3Type==='weapon' && equipped). Pre-filtered by page.tsx. */
  equippedWeapons: EnrichedInventoryItem[];
  /** Living NPC combatants (characterId===null && hpCurrent>0). Pre-filtered by page.tsx. */
  npcTargets: EncounterCombatant[];
  /** Optimistic-concurrency version token. */
  version: number;
  /** True when it is this combatant's turn. */
  isOwnTurn: boolean;
  /** True when the action has already been spent this turn. */
  actionUsed: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AttackSheet({
  encounterId,
  attackerCombatantId,
  equippedWeapons,
  npcTargets,
  version,
  isOwnTurn,
  actionUsed,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('weapon');
  const [selectedWeapon, setSelectedWeapon] = useState<EnrichedInventoryItem | null>(null);
  const [attackError, setAttackError] = useState<string | null>(null);
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // REQ-WCA-WEB-UI-01: trigger hidden when no weapons or no NPC targets
  const hasWeapons = equippedWeapons.length > 0;
  const hasTargets = npcTargets.length > 0;
  if (!hasWeapons || !hasTargets) return null;

  // Button is disabled when: not own turn, or action already spent.
  const triggerDisabled = !isOwnTurn || actionUsed;

  function handleOpen() {
    // Reset state on each open
    setStep('weapon');
    setSelectedWeapon(null);
    setAttackError(null);
    setAttackResult(null);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  function handlePickWeapon(weapon: EnrichedInventoryItem) {
    setSelectedWeapon(weapon);
    setStep('target');
  }

  function handlePickTarget(target: EncounterCombatant) {
    if (!selectedWeapon) return;

    startTransition(async () => {
      setAttackError(null);
      const res = await attackApplyAction(
        encounterId,
        attackerCombatantId,
        target.id,
        selectedWeapon.instanceId,
        version,
      );

      if (!res.ok) {
        if (res.code === 'VERSION_CONFLICT') {
          // ADR-3: stale state — refresh and close (mirrors RageControls/PassTurnButton pattern)
          router.refresh();
          setOpen(false);
          return;
        }
        if (res.code === 'FORBIDDEN') {
          setAttackError('No tienes permiso para realizar esta acción.');
          return;
        }
        if (res.code === 'TARGET_NOT_NPC') {
          setAttackError('El objetivo seleccionado no es un NPC. Recargá la página e intentá nuevamente.');
          return;
        }
        setAttackError(res.message ?? 'Error al realizar el ataque. Intentá nuevamente.');
        return;
      }

      setAttackResult(res.result as AttackResult);
      setStep('result');
    });
  }

  return (
    <>
      {/* REQ-WCA-WEB-UI-01: full-width ≥44px trigger button */}
      <button
        type="button"
        aria-label="Atacar"
        disabled={triggerDisabled || isPending}
        onClick={handleOpen}
        className="w-full min-h-[44px] rounded text-sm font-semibold border border-line disabled:opacity-40"
      >
        Atacar
      </button>

      <V3Sheet open={open} onClose={handleClose} title="Atacar">
        {/* ── Error banner (persists across steps) ─────────────────────────── */}
        {attackError && (
          <p className="text-xs text-red-600 mb-3" role="alert">{attackError}</p>
        )}

        {/* ── Step 1: weapon pick ──────────────────────────────────────────── */}
        {step === 'weapon' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft mb-1">Elegí un arma</p>
            {equippedWeapons.map((weapon) => (
              <button
                key={weapon.instanceId}
                type="button"
                onClick={() => handlePickWeapon(weapon)}
                className="w-full min-h-[44px] rounded border border-line text-sm font-medium text-left px-3"
              >
                {weapon.displayName}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClose}
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
                  onClick={() => handlePickTarget(npc)}
                  className="w-full min-h-[44px] rounded border border-line text-sm font-medium text-left px-3 disabled:opacity-40"
                >
                  {npc.name}
                  <span className="ml-2 text-ink-soft text-xs">HP: {npc.hpCurrent}/{npc.hpMax}</span>
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => setStep('weapon')}
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

            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[44px] rounded text-sm font-semibold border border-line mt-2"
            >
              Cerrar
            </button>
          </div>
        )}
      </V3Sheet>
    </>
  );
}
