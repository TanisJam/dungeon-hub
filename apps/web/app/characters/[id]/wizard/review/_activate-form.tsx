'use client';

import { useRef } from 'react';
import { useActionState } from 'react';
import { publishCharacter, type PublishState } from './actions';
import { WizardFooterNav } from '@/components/wizard/wizard-footer-nav';
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
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(publishCharacter, INITIAL);

  if (state.success) {
    return <PublishedSplash characterName={characterName} />;
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="characterId" value={characterId} />

      {!canActivate && (
        <p className="text-xs text-warning-deep">
          Algunos pasos están incompletos. Podés publicar igual, pero la ficha quedará incompleta.
        </p>
      )}

      {state.error && <p className="text-sm text-warning-deep">{state.error}</p>}

      <WizardFooterNav
        backHref={`/characters/${characterId}/wizard/background`}
        nextLabel="Publicar"
        nextIcon="check"
        onNext={() => formRef.current?.requestSubmit()}
        pending={pending}
      />
    </form>
  );
}
