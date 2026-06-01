'use client';

import { useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';
import { skipSpells } from './actions';

type Props = {
  characterId: string;
  variant: 'non-caster' | 'too-early';
  className: string;
  level: number;
  /** Override the back href. Defaults to /wizard/equipment (inserted between background and spells in Batch D). */
  backHref?: string;
};

export function NoPicksPanel({ characterId, variant, className, level, backHref }: Props) {
  const [pending, startTransition] = useTransition();

  function handleSkip() {
    startTransition(async () => {
      await skipSpells(characterId);
    });
  }

  const body =
    variant === 'non-caster'
      ? 'Tu clase no utiliza hechizos.'
      : 'Tu clase aprende hechizos al subir de nivel. No hay nada que elegir ahora.';

  return (
    <>
      <Card variant="surface" className="p-4">
        <p className="text-sm font-semibold text-ink">
          {className} · Nivel {level}
        </p>
        <p className="mt-2 text-sm text-ink-mute">{body}</p>
      </Card>

      <WizardFooterNav
        backHref={backHref ?? `/characters/${characterId}/wizard/equipment`}
        onNext={handleSkip}
        pending={pending}
      />
    </>
  );
}
