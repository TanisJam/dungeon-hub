'use client';

// Dev-only catalog island for AttackSheetView.
// Uses AttackSheetView directly with fixture weapons + targets + local React state
// (stub result instead of calling attackApplyAction — catalog visualization only).

import { useState } from 'react';
import { AttackSheetView } from '@/components/encuentros/attack-sheet-view';
import type { AttackResult, AttackStep } from '@/components/encuentros/attack-sheet-view';
import type { EnrichedInventoryItem } from '@/lib/sheet-types';
import type { EncounterCombatant } from '@/components/encuentros/types';

const FIXTURE_WEAPONS: EnrichedInventoryItem[] = [
  {
    instanceId: 'w1',
    itemSlug: 'espada-larga',
    itemSource: 'PHB',
    displayName: 'Espada larga',
    quantity: 1,
    equipped: true,
    equipHand: 'main',
    charges: null,
    v3Type: 'weapon',
    rarity: null,
    reqAttune: null,
    magicFlag: false,
    weight: 3,
    qty: 1,
  },
  {
    instanceId: 'w2',
    itemSlug: 'daga',
    itemSource: 'PHB',
    displayName: 'Daga',
    quantity: 1,
    equipped: true,
    equipHand: 'off',
    charges: null,
    v3Type: 'weapon',
    rarity: null,
    reqAttune: null,
    magicFlag: false,
    weight: 1,
    qty: 1,
  },
];

const FIXTURE_TARGETS: EncounterCombatant[] = [
  {
    id: 'npc1',
    name: 'Goblin A',
    kind: 'npc',
    characterId: null,
    initiative: 10,
    hpCurrent: 7,
    hpMax: 7,
    ac: 12,
    insertionOrder: 1,
    conditions: [],
    effects: [],
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    attacksRemaining: 1,
  },
  {
    id: 'npc2',
    name: 'Goblin B',
    kind: 'npc',
    characterId: null,
    initiative: 8,
    hpCurrent: 3,
    hpMax: 7,
    ac: 12,
    insertionOrder: 2,
    conditions: [],
    effects: [],
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    attacksRemaining: 1,
  },
];

type Props = {
  isOwnTurn?: boolean;
  actionUsed?: boolean;
};

export function AttackSheetIsland({ isOwnTurn = true, actionUsed = false }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<AttackStep>('weapon');
  const [selectedWeapon, setSelectedWeapon] = useState<EnrichedInventoryItem | null>(null);
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null);

  const triggerDisabled = !isOwnTurn || actionUsed;

  function handleOpen() {
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
    // Stub result — simulate a hit with fixture rolls (no real server action in catalog)
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + 5;
    const targetAc = target.ac ?? 10;
    const hit = total >= targetAc;
    if (hit) {
      const rolledDamage = Math.floor(Math.random() * 8) + 1 + 3;
      setAttackResult({
        hit: true,
        d20,
        total,
        targetAc,
        rolledDamage,
        damageType: 'cortante',
        newHp: Math.max(0, target.hpCurrent - rolledDamage),
        crit: d20 === 20,
      });
    } else {
      setAttackResult({ hit: false, d20, total, targetAc });
    }
    setStep('result');
  }

  return (
    <AttackSheetView
      open={open}
      step={step}
      selectedWeapon={selectedWeapon}
      attackResult={attackResult}
      attackError={null}
      isPending={false}
      triggerDisabled={triggerDisabled}
      equippedWeapons={FIXTURE_WEAPONS}
      npcTargets={FIXTURE_TARGETS}
      onOpen={handleOpen}
      onClose={handleClose}
      onPickWeapon={handlePickWeapon}
      onPickTarget={handlePickTarget}
      onBackToWeapon={() => setStep('weapon')}
    />
  );
}
