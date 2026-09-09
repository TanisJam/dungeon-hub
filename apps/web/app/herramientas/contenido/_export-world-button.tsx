'use client';

// World JSON export — MVP #3.9's other half (character export already shipped
// as apps/web/app/characters/[id]/_export-button.tsx). Same blob + filename
// approach, reused rather than reinvented — see that file for the pattern
// this mirrors.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui';
import { slugify } from '@/components/compendium/slugify';
import type { WorldExportEnvelope } from '@/lib/world-export-types';

interface Props {
  worldId: string;
}

type State = 'idle' | 'loading' | 'error';

export function ExportWorldButton({ worldId }: Props) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (state === 'loading') return; // double-tap guard, same as character export
    setState('loading');
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const envelope = await api.get<WorldExportEnvelope>(
        `/worlds/${worldId}/export`,
        session.access_token,
      );

      // Build Blob from the parsed envelope and trigger download.
      const json = JSON.stringify(envelope, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Client-side slug derivation — same rule as server (shared slugify).
      const slug = slugify(envelope.world.name) || `world-${worldId}`;
      const filename = `${slug}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url); // avoid memory leak

      setState('idle');
    } catch (err) {
      const msg =
        err instanceof ApiError &&
        typeof err.body === 'object' &&
        err.body &&
        'error' in err.body
          ? String((err.body as { error: unknown }).error)
          : getErrorMessage(err, 'Error al exportar el mundo');
      setError(msg);
      setState('error');
    }
  }

  return (
    <div className="space-y-2">
      <Button
        tone="ghost"
        size="md"
        fullWidth
        onClick={handleExport}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Exportando…' : 'Exportar mundo (JSON)'}
      </Button>
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
