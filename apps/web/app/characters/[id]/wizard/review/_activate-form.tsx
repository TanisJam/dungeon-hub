'use client';

import { useActionState } from 'react';
import { activateCharacter, type ActivateState } from './actions';

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
    <form action={action}>
      <input type="hidden" name="characterId" value={characterId} />

      {!canActivate && (
        <p className="mb-3 text-sm text-amber-400">
          Some steps are still missing. You can still activate, but the sheet will be incomplete.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
      >
        {pending ? 'Activating…' : '✓ Activate character'}
      </button>

      {state.error && <p className="mt-3 text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
