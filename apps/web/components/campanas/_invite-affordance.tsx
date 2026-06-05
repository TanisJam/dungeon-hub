'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';

type State = 'idle' | 'loading' | 'copied' | 'error';

export function InviteAffordance({ campaignId }: { campaignId: string }) {
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setState('loading');
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const result = await api.post<{ url: string; expiresAt: string }>(
        `/campaigns/${campaignId}/invite`,
        {},
        session.access_token,
      );

      if (typeof navigator.share === 'function') {
        await navigator.share({ url: result.url });
      } else {
        await navigator.clipboard.writeText(result.url);
        setState('copied');
        setTimeout(() => setState('idle'), 3000);
        return;
      }
      setState('idle');
    } catch (err) {
      // navigator.share AbortError means the user dismissed the share sheet — not a real error
      if (err instanceof Error && err.name === 'AbortError') {
        setState('idle');
        return;
      }
      const msg =
        err instanceof ApiError &&
        typeof err.body === 'object' &&
        err.body &&
        'error' in err.body
          ? String((err.body as { error: unknown }).error)
          : err instanceof Error
            ? err.message
            : 'Error desconocido';
      setError(msg);
      setState('error');
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Button
        tone="ghost"
        size="md"
        fullWidth
        onClick={handle}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Generando enlace…' : 'Invitar jugador'}
      </Button>
      {state === 'copied' && (
        <p className="text-xs text-ink-soft text-center">
          Enlace copiado · vence en 7 días
        </p>
      )}
      {error && <p className="text-sm text-warning-deep">{error}</p>}
    </div>
  );
}
