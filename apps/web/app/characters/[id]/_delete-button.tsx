'use client';

import { useState, useTransition } from 'react';
import { deleteCharacter } from './actions';

interface Props {
  characterId: string;
  characterName: string;
}

export function DeleteCharacterButton({ characterId, characterName }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setError(null);
    setOpen(true);
  }

  function handleCancel() {
    setOpen(false);
    setError(null);
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteCharacter(characterId);
      if (result && !result.ok) {
        setError(result.error);
      }
      // On success: deleteCharacter redirects — no local state needed
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
        aria-label="Eliminar personaje"
      >
        Eliminar personaje
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCancel}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2
              id="delete-dialog-title"
              className="text-base font-bold text-ink mb-2"
            >
              {`¿Eliminar a ${characterName}?`}
            </h2>
            <p className="text-sm text-ink-mute mb-6">
              Esta acción no se puede deshacer.
            </p>

            {error && (
              <p role="alert" className="mb-4 text-sm font-medium text-red-500">
                {error}
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="text-sm font-medium text-ink-soft hover:text-ink transition-colors px-4 py-2 rounded-xl border border-line disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
