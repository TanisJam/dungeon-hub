'use client';

import { useState, useTransition } from 'react';
import { FormErrorAlert } from '@/components/ui/form-error-alert';
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
        className="inline-flex min-h-[44px] items-center text-sm font-medium text-danger transition-colors hover:text-danger-deep"
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
            className="absolute inset-0 bg-paper/70"
            onClick={handleCancel}
            aria-hidden="true"
          />

          {/* Panel */}
          <div className="relative z-10 w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-stamp-lg">
            <h2
              id="delete-dialog-title"
              className="text-base font-bold text-ink mb-2"
            >
              {`¿Eliminar a ${characterName}?`}
            </h2>
            <p className="text-sm text-ink-mute mb-6">
              Esta acción no se puede deshacer.
            </p>

            <FormErrorAlert message={error} className="mb-4" />

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isPending}
                className="min-h-[44px] rounded-md border border-line px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="min-h-[44px] rounded-md bg-danger-deep px-4 py-2 text-sm font-bold text-on-danger transition-colors hover:bg-danger disabled:opacity-50"
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
