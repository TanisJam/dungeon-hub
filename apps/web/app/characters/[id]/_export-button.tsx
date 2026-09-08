'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui';
import { slugify } from '@/components/compendium/slugify';
import type { CharacterExportEnvelope } from '@/lib/sheet-types';

interface Props {
  characterId: string;
  characterName: string;
}

type State = 'idle' | 'loading' | 'error';

export function ExportButton({ characterId, characterName }: Props) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (state === 'loading') return; // double-tap guard (REQ-EXP-BTN-05)
    setState('loading');
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const envelope = await api.get<CharacterExportEnvelope>(
        `/characters/${characterId}/export`,
        session.access_token,
      );

      // Build Blob from the parsed envelope and trigger download (REQ-EXP-BTN-02)
      const json = JSON.stringify(envelope, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Client-side slug derivation — same rule as server (REQ-EXP-BTN-09)
      const slug = slugify(envelope.character.name) || `character-${envelope.character.id}`;
      const filename = `${slug}.json`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url); // avoid memory leak (REQ-EXP-BTN-02)

      setState('idle');
    } catch (err) {
      const msg =
        err instanceof ApiError &&
        typeof err.body === 'object' &&
        err.body &&
        'error' in err.body
          ? String((err.body as { error: unknown }).error)
          : getErrorMessage(err, 'Error al exportar');
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
        {state === 'loading' ? 'Exportando…' : 'Exportar JSON'}
      </Button>
      {error && (
        <p className="text-sm text-warning-deep">{error}</p>
      )}
    </div>
  );
}
