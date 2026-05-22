'use client';

import { useActionState } from 'react';
import { activateCharacter, type ActivateState } from './actions';
import { Button } from '@/components/ui';

const INITIAL: ActivateState = { error: null };

export function ActivateForm({
  characterId,
  canActivate,
}: {
  characterId: string;
  canActivate: boolean;
}) {
  const [state, action, pending] = useActionState(activateCharacter, INITIAL);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="characterId" value={characterId} />

      {!canActivate && (
        <p className="text-xs text-warning-deep">
          Algunos pasos están incompletos. Podés activar igual, pero la ficha quedará incompleta.
        </p>
      )}

      <Button
        tone="cta"
        size="lg"
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Activando…' : '✓ Activar personaje'}
      </Button>

      {state.error && <p className="text-sm text-warning-deep">{state.error}</p>}
    </form>
  );
}
