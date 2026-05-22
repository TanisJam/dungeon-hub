'use client';

import { useActionState } from 'react';
import { publishCharacter, type PublishState } from './actions';
import { Button } from '@/components/ui';
import { PublishedSplash } from '@/components/wizard/published-splash';

const INITIAL: PublishState = { error: null, success: false };

export function ActivateForm({
  characterId,
  characterName,
  canActivate,
}: {
  characterId: string;
  characterName: string;
  canActivate: boolean;
}) {
  const [state, action, pending] = useActionState(publishCharacter, INITIAL);

  if (state.success) {
    return <PublishedSplash characterName={characterName} />;
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="characterId" value={characterId} />

      {!canActivate && (
        <p className="text-xs text-warning-deep">
          Algunos pasos están incompletos. Podés publicar igual, pero la ficha quedará incompleta.
        </p>
      )}

      <Button
        tone="cta"
        size="lg"
        type="submit"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Publicando…' : '✓ Publicar para aprobación'}
      </Button>

      {state.error && <p className="text-sm text-warning-deep">{state.error}</p>}
    </form>
  );
}
