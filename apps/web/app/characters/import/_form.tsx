'use client';

// Character re-import form (inverse of ../[id]/_export-button.tsx).
// Reads and parses the selected file client-side (via the pure domain
// validator) so an obviously wrong file is rejected without a round-trip —
// the server re-runs the same check regardless (never trust the client as
// the gate). Mirrors ../new/_form.tsx for world selection.

import { useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { Button, FormErrorAlert } from '@/components/ui';
import { validateImportEnvelope } from '@dungeon-hub/domain/character/import';
import { describeEnvelopeIssues, describeImportError, type ImportErrorDisplay } from './_error-messages';

type World = { id: string; name: string; slug: string };

interface Props {
  worlds: World[];
}

// FileReader rather than `file.text()`: both work in real browsers, but jsdom
// (the test environment for *.test.tsx) does not implement File#text().
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsText(file);
  });
}

export function ImportCharacterForm({ worlds }: Props) {
  const router = useRouter();

  const [worldId, setWorldId] = useState(worlds.length === 1 ? worlds[0]!.id : '');
  const [fileName, setFileName] = useState<string | null>(null);
  // Non-null only once the file passed the client-side shape check — the
  // gate the submit button reads to decide whether an import is possible.
  const [envelope, setEnvelope] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ImportErrorDisplay | null>(null);
  const [createdCharacterId, setCreatedCharacterId] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setCreatedCharacterId(null);
    setEnvelope(null);
    setError(null);

    if (!file) {
      setFileName(null);
      return;
    }
    setFileName(file.name);

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setError({ message: 'No se pudo leer el archivo. Probá de nuevo.' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError({ message: 'El archivo no es un JSON válido.' });
      return;
    }

    const validated = validateImportEnvelope(parsed);
    if (!validated.ok) {
      setError(describeEnvelopeIssues(validated.issues));
      return;
    }

    setEnvelope(parsed);
  }

  async function handleSubmit() {
    if (!worldId || envelope === null || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const created = await api.post<{ id: string }>(
        '/characters/import',
        { worldId, envelope },
        session.access_token,
      );

      setCreatedCharacterId(created.id);
    } catch (err) {
      setError(describeImportError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (createdCharacterId) {
    return (
      <div className="space-y-4 rounded-md border border-line bg-surface p-4">
        <p className="text-sm text-ink">
          ¡Listo! El personaje se importó como borrador. Todavía necesita pasar por
          la aprobación de tu DM antes de poder jugarlo.
        </p>
        <Button
          tone="green"
          size="md"
          fullWidth
          onClick={() => router.push(`/characters/${createdCharacterId}`)}
        >
          Ver personaje
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {worlds.length > 1 && (
        <div>
          <label htmlFor="worldId" className="block text-sm font-semibold text-ink-soft">
            Mundo
          </label>
          <select
            id="worldId"
            value={worldId}
            onChange={(e) => setWorldId(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none transition-colors"
          >
            <option value="" disabled>
              Elegí un mundo…
            </option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {worlds.length === 1 && (
        <p className="text-xs text-ink-mute">Único mundo disponible — seleccionado automáticamente.</p>
      )}

      <div>
        <label htmlFor="importFile" className="block text-sm font-semibold text-ink-soft">
          Archivo exportado
        </label>
        <input
          id="importFile"
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="mt-1.5 block w-full text-sm text-ink-mute file:mr-3 file:rounded-md file:border-0 file:bg-paper-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink"
        />
        {fileName && (
          <p className="mt-1 text-xs text-ink-mute">Archivo: {fileName}</p>
        )}
      </div>

      {error && (
        <div className="space-y-1">
          <FormErrorAlert message={error.message} />
          {error.details && error.details.length > 0 && (
            <ul className="list-disc space-y-0.5 rounded-md bg-danger-soft px-3 py-2 pl-8 text-sm text-danger">
              {error.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button
        tone="green"
        size="md"
        fullWidth
        disabled={!worldId || envelope === null || submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Importando…' : 'Importar personaje'}
      </Button>
    </div>
  );
}
