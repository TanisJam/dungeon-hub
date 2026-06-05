'use client';

// REQ-WCA-WEB-UI-01, REQ-WCA-WEB-UI-02 — AttackSheetIsland container layer.
// Owns: useState for open/step/selectedWeapon/attackResult, useEncounterAction, SA wiring.
// Renders AttackSheetView with all controlled state.
// Public prop interface is identical to the former AttackSheet monolith.
// VERSION_CONFLICT → router.refresh() + close via onConflict callback.
// PHB p.189-190, 192 — weapon attack costs the Action for the turn.

import { useState } from 'react';
import { attackApplyAction } from '@/app/encuentros/[id]/actions';
import { useEncounterAction } from './use-encounter-action';
import { AttackSheetView } from './attack-sheet-view';
import type { AttackResult, AttackStep } from './attack-sheet-view';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';
import type { EncounterCombatant } from './types';

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

export function AttackSheetIsland({
  encounterId,
  attackerCombatantId,
  equippedWeapons,
  npcTargets,
  version,
  isOwnTurn,
  actionUsed,
}: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<AttackStep>('weapon');
  const [selectedWeapon, setSelectedWeapon] = useState<EnrichedInventoryItem | null>(null);
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null);

  // ADR-3: VERSION_CONFLICT → router.refresh() + close via onConflict callback.
  const { isPending, actionError: attackError, runAction } = useEncounterAction({
    fallbackError: 'Error al realizar el ataque. Intentá nuevamente.',
    onConflict: () => setOpen(false),
  });

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

    runAction(async () => {
      const res = await attackApplyAction(
        encounterId,
        attackerCombatantId,
        target.id,
        selectedWeapon.instanceId,
        version,
      );

      // Normalize TARGET_NOT_NPC with its component-specific message so the
      // hook's generic error branch sets the correct text.
      if (!res.ok && res.code === 'TARGET_NOT_NPC') {
        return {
          ...res,
          message: 'El objetivo seleccionado no es un NPC. Recargá la página e intentá nuevamente.',
        };
      }

      // On success advance to result step.
      if (res.ok) {
        setAttackResult(res.result as AttackResult);
        setStep('result');
      }

      return res;
    });
  }

  return (
    <AttackSheetView
      open={open}
      step={step}
      selectedWeapon={selectedWeapon}
      attackResult={attackResult}
      attackError={attackError}
      isPending={isPending}
      triggerDisabled={triggerDisabled}
      equippedWeapons={equippedWeapons}
      npcTargets={npcTargets}
      onOpen={handleOpen}
      onClose={handleClose}
      onPickWeapon={handlePickWeapon}
      onPickTarget={handlePickTarget}
      onBackToWeapon={() => setStep('weapon')}
    />
  );
}
