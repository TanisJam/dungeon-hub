'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';

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
      <p className="text-emerald-400">
        ✓ Linked. You can close this tab and head back to Discord.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handle}
        disabled={state === 'loading'}
        className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition"
      >
        {state === 'loading' ? 'Linking…' : 'Confirm link'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
