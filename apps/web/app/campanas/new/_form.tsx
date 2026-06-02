'use client';

import { useActionState } from 'react';
import { createCampaign, type CreateState } from './actions';
import { Button } from '@/components/ui';

const INITIAL: CreateState = { error: null };

export function NewCampaignForm() {
  const [state, action, pending] = useActionState(createCampaign, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-semibold text-ink-soft">
          Nombre de la campaña
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={120}
          placeholder="La Maldición de Strahd"
          className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none transition-colors"
        />
        <p className="mt-1 text-xs text-ink-mute">
          Se crea un mundo nuevo con esta campaña. Vas a ser su DM.
        </p>
      </div>

      {state.error && (
        <p className="text-sm text-warning-deep">{state.error}</p>
      )}

      <Button
        type="submit"
        tone="green"
        size="md"
        disabled={pending}
        className="w-full"
      >
        {pending ? 'Creando…' : 'Crear campaña'}
      </Button>
    </form>
  );
}
