'use client';

import { useState, useRef, useCallback } from 'react';
import { updateCharacterName } from '@/app/characters/[id]/wizard/review/actions';

interface CharacterNameInputProps {
  characterId: string;
  initialName: string;
}

export function CharacterNameInput({ characterId, initialName }: CharacterNameInputProps) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (value: string) => {
      setStatus('saving');
      setErrorMsg(null);
      const result = await updateCharacterName(characterId, value);
      if (result.error) {
        setStatus('error');
        setErrorMsg(result.error);
      } else {
        setStatus('saved');
      }
    },
    [characterId],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setName(value);
    setStatus('idle');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      save(value);
    }, 1000);
  };

  const handleBlur = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    save(name);
  };

  return (
    <div className="rounded-md bg-surface border border-line shadow-stamp-md p-4">
      <label
        htmlFor="character-name"
        className="block text-[10px] font-bold uppercase tracking-widest text-ink-mute mb-2"
      >
        Nombre del Personaje
      </label>
      <input
        id="character-name"
        type="text"
        value={name}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-display text-base text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-accent/50"
        placeholder="Nombre del personaje…"
      />
      {status === 'saving' && (
        <p className="mt-1 text-[10px] text-ink-mute">Guardando…</p>
      )}
      {status === 'saved' && (
        <p className="mt-1 text-[10px] text-primary-deep">✓ Guardado</p>
      )}
      {status === 'error' && (
        <p className="mt-1 text-[10px] text-warning-deep">{errorMsg ?? 'Error al guardar'}</p>
      )}
    </div>
  );
}
