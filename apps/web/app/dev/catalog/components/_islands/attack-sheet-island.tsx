'use client';

// NOTE: mirrors AttackSheet (apps/web/components/encuentros/attack-sheet.tsx)
// Dev-only catalog island — supplies fixture weapons + targets; stub result instead of
// calling attackApplyAction server action. Visual replica: 3-step weapon → target → result.

import { useState } from 'react';
import { V3Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

type Step = 'weapon' | 'target' | 'result';

type FixtureWeapon = { instanceId: string; displayName: string };
type FixtureTarget = { id: string; name: string; hpCurrent: number; hpMax: number };

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
type AttackMissResult = { hit: false; d20: number; total: number; targetAc: number };
type AttackResult = AttackHitResult | AttackMissResult;

const FIXTURE_WEAPONS: FixtureWeapon[] = [
  { instanceId: 'w1', displayName: 'Espada larga' },
  { instanceId: 'w2', displayName: 'Daga' },
];

const FIXTURE_TARGETS: FixtureTarget[] = [
  { id: 'npc1', name: 'Goblin A', hpCurrent: 7, hpMax: 7 },
  { id: 'npc2', name: 'Goblin B', hpCurrent: 3, hpMax: 7 },
];

type Props = {
  isOwnTurn?: boolean;
  actionUsed?: boolean;
};

export function AttackSheetIsland({ isOwnTurn = true, actionUsed = false }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('weapon');
  const [selectedWeapon, setSelectedWeapon] = useState<FixtureWeapon | null>(null);
  const [attackError] = useState<string | null>(null);
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

  function handlePickWeapon(weapon: FixtureWeapon) {
    setSelectedWeapon(weapon);
    setStep('target');
  }

  function handlePickTarget(target: FixtureTarget) {
    // Stub result — simulate a hit with fixture rolls (no real server action in catalog)
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + 5;
    const targetAc = 12;
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
    <>
      <Button
        tone="ghost"
        aria-label="Atacar"
        disabled={triggerDisabled}
        onClick={handleOpen}
        className="w-full min-h-[44px]"
      >
        Atacar
      </Button>

      <V3Sheet open={open} onClose={handleClose} title="Atacar">
        {attackError && (
          <p className="text-xs text-red-600 mb-3" role="alert">{attackError}</p>
        )}

        {step === 'weapon' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft mb-1">Elegí un arma</p>
            {FIXTURE_WEAPONS.map((weapon) => (
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

        {step === 'target' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-ink-soft mb-1">
              {selectedWeapon?.displayName} — elegí un objetivo
            </p>
            {FIXTURE_TARGETS.map((npc) => (
              <button
                key={npc.id}
                type="button"
                onClick={() => handlePickTarget(npc)}
                className="w-full min-h-[44px] rounded border border-line text-sm font-medium text-left px-3"
              >
                {npc.name}
                <span className="ml-2 text-ink-soft text-xs">HP: {npc.hpCurrent}/{npc.hpMax}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setStep('weapon')}
              className="w-full min-h-[44px] rounded text-sm text-ink-soft border border-line mt-2"
            >
              Volver
            </button>
          </div>
        )}

        {step === 'result' && attackResult && (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold text-center">
              {attackResult.hit ? '¡Impacto!' : 'Fallo'}
            </p>
            <div className="text-sm text-center text-ink-soft">
              d20: {attackResult.d20} → total: {attackResult.total} vs CA {attackResult.targetAc}
            </div>
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
              onClick={handleClose}
              className="w-full min-h-[44px] mt-2"
            >
              Cerrar
            </Button>
          </div>
        )}
      </V3Sheet>
    </>
  );
}
