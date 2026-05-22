'use client';

import { useActionState } from 'react';
import { createCharacter, type CreateState } from './actions';
import { Button } from '@/components/ui';

type Campaign = { id: string; name: string };
const INITIAL: CreateState = { error: null };

export function NewCharacterForm({ campaigns }: { campaigns: Campaign[] }) {
  const [state, action, pending] = useActionState(createCharacter, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="campaignId" className="block text-sm font-semibold text-ink-soft">
          Campaña
        </label>
        <select
          id="campaignId"
          name="campaignId"
          required
          defaultValue=""
          className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none transition-colors"
        >
          <option value="" disabled>
            Elegí una campaña…
          </option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-semibold text-ink-soft">
          Nombre del personaje
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="Thorgar el Inquebrantable"
          className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-primary focus:outline-none transition-colors"
        />
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
        {pending ? 'Creando…' : 'Crear personaje'}
      </Button>
    </form>
  );
}
