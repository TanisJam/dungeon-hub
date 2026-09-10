'use client';

import { useState } from 'react';

/**
 * Dev-only client island for CharacterNameInput visual.
 * Recreates the visual structure of CharacterNameInput WITHOUT calling the
 * real updateCharacterName server action (which requires a live character row).
 * Mirrors the controlled-input UI faithfully for catalog inspection at 375px.
 */
export function CharacterNameInputIsland(props: { initialName: string }) {
  const [name, setName] = useState(props.initialName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setStatus('idle');
  };

  const handleBlur = () => {
    if (name.trim()) {
      setStatus('saving');
      // Simulate async save (no real server action in catalog)
      setTimeout(() => setStatus('saved'), 600);
    }
  };

  return (
    <div className="rounded-md bg-surface border border-line shadow-stamp-md p-4">
      <label
        htmlFor="catalog-character-name"
        className="block text-[10px] font-bold uppercase tracking-widest text-ink-mute mb-2"
      >
        Nombre del Personaje
      </label>
      <input
        id="catalog-character-name"
        type="text"
        value={name}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-full min-h-[44px] rounded-md border border-line bg-paper-soft px-3 py-2 font-display text-base text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-accent/50"
        placeholder="Nombre del personaje…"
      />
      {status === 'saving' && (
        <p className="mt-1 text-[10px] text-ink-mute">Guardando…</p>
      )}
      {status === 'saved' && (
        <p className="mt-1 text-[10px] text-primary-deep">✓ Guardado</p>
      )}
    </div>
  );
}
