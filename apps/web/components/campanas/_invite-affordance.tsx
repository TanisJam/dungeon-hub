'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui';

type State = 'idle' | 'loading' | 'copied' | 'shared' | 'error';

/** Friendly expiry date, e.g. "14 de junio". */
function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(iso));
}

export function InviteAffordance({ campaignId }: { campaignId: string }) {
  const [state, setState] = useState<State>('idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
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
      setExpiresAt(result.expiresAt);

      if (typeof navigator.share === 'function') {
        await navigator.share({ url: result.url });
        setState('shared');
        setTimeout(() => setState('idle'), 3000);
      } else {
        await navigator.clipboard.writeText(result.url);
        setState('copied');
        setTimeout(() => setState('idle'), 3000);
      }
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
          : getErrorMessage(err);
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
      {(state === 'copied' || state === 'shared') && expiresAt && (
        <p className="text-xs text-ink-soft text-center">
          {state === 'copied' ? 'Enlace copiado' : 'Enlace compartido'} · vence el {formatExpiry(expiresAt)}
        </p>
      )}
      {error && <p className="text-sm text-warning-deep">{error}</p>}
    </div>
  );
}
