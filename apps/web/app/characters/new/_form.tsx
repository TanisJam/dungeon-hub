'use client';

import { useActionState } from 'react';
import { createCharacter, type CreateState } from './actions';
import { Button } from '@/components/ui';

type World = { id: string; name: string; slug: string };
const INITIAL: CreateState = { error: null };

export function NewCharacterForm({ worlds }: { worlds: World[] }) {
  const [state, action, pending] = useActionState(createCharacter, INITIAL);

  // If exactly 1 world, pre-select it so the user doesn't have to interact.
  const defaultWorldId = worlds.length === 1 ? worlds[0]!.id : '';

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="worldId" className="block text-sm font-semibold text-ink-soft">
          Mundo
        </label>
        <select
          id="worldId"
          name="worldId"
          required
          defaultValue={defaultWorldId}
          className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none transition-colors"
        >
          {worlds.length > 1 && (
            <option value="" disabled>
              Elegí un mundo…
            </option>
          )}
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        {worlds.length === 1 && (
          <p className="mt-1 text-xs text-ink-mute">Único mundo disponible — seleccionado automáticamente.</p>
        )}
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
