'use client';

import { useActionState } from 'react';
import { createCharacter, type CreateState } from './actions';

type Campaign = { id: string; name: string };
const INITIAL: CreateState = { error: null };

export function NewCharacterForm({ campaigns }: { campaigns: Campaign[] }) {
  const [state, action, pending] = useActionState(createCharacter, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="campaignId" className="block text-sm font-medium text-zinc-300">
          Campaign
        </label>
        <select
          id="campaignId"
          name="campaignId"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="" disabled>
            Pick a campaign…
          </option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-zinc-300">
          Character name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="Thorgar the Unyielding"
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
      >
        {pending ? 'Creating…' : 'Create character'}
      </button>
    </form>
  );
}
