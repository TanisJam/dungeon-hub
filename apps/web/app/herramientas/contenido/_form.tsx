'use client';

// Custom content via JSON upload — items only (MVP #3.8, DEC-1). Paste-only
// upload: NO file-picker / drag-drop — a <textarea> + submit is the
// smallest thing that works for the basic slice (brief scope).

import { useActionState } from 'react';
import { Button } from '@/components/ui';
import { uploadHomebrewItems, INITIAL_UPLOAD_STATE } from './actions';
import { HOMEBREW_JSON_EXAMPLE } from './parse-items';

interface HomebrewUploadFormProps {
  worldId: string;
  /** Per-world homebrew source code (HB-<worldId prefix>) — shown so the DM
   *  can find their content later in the compendium's "fuente" column. */
  sourceCode: string;
}

export function HomebrewUploadForm({ worldId, sourceCode }: HomebrewUploadFormProps) {
  const [state, action, pending] = useActionState(uploadHomebrewItems, INITIAL_UPLOAD_STATE);

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-line bg-paper-soft px-3 py-2.5 text-sm">
        <p className="text-ink-soft">
          Fuente homebrew de este mundo:{' '}
          <span className="font-mono font-semibold text-ink">{sourceCode}</span>
        </p>
        <p className="mt-1 text-xs text-ink-mute">
          Buscá este código en la columna "fuente" del compendio para encontrar tu contenido.
        </p>
      </div>

      <form action={action} className="space-y-4">
        {/* worldId is NOT user-editable — forwarded as a hidden field, same
            pattern as apps/web/app/campanas/new/_form.tsx. */}
        <input type="hidden" name="worldId" value={worldId} />

        <div>
          <label htmlFor="itemsJson" className="block text-sm font-semibold text-ink-soft">
            Items (array JSON)
          </label>
          <textarea
            id="itemsJson"
            name="itemsJson"
            rows={12}
            required
            placeholder={HOMEBREW_JSON_EXAMPLE}
            className="mt-1.5 w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
          <p className="mt-1 text-xs text-ink-mute">
            Pegá un array JSON de items. Cada uno necesita al menos "name"; "type", "weight" y
            "data" son opcionales. Máximo 200 items por carga.
          </p>
        </div>

        {state.status === 'error' && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        )}
        {state.status === 'success' && (
          <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            {state.message}
          </p>
        )}

        <Button type="submit" tone="green" size="md" fullWidth disabled={pending}>
          {pending ? 'Subiendo…' : 'Subir contenido'}
        </Button>
      </form>

      <details className="rounded-md border border-line bg-paper-soft px-3 py-2.5 text-sm">
        <summary className="cursor-pointer min-h-[44px] flex items-center font-semibold text-ink">
          Ejemplo de JSON esperado
        </summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface p-2 text-xs text-ink-mute">
          {HOMEBREW_JSON_EXAMPLE}
        </pre>
      </details>
    </div>
  );
}
