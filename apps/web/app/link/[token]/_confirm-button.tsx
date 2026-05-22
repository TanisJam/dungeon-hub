'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';

export function ConfirmLinkButton({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setState('loading');
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');
      await api.post('/auth/link/confirm', { token }, session.access_token);
      setState('done');
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof ApiError && typeof err.body === 'object' && err.body && 'message' in err.body
          ? String((err.body as { message: unknown }).message)
          : err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <p className="text-success font-semibold">
        ✓ Vinculado. Podés cerrar esta pestaña y volver a Discord.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        tone="green"
        size="md"
        onClick={handle}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Vinculando…' : 'Confirmar vínculo'}
      </Button>
      {error && <p className="text-sm text-warning-deep">{error}</p>}
    </div>
  );
}
