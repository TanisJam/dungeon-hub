'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui';

export function ConfirmInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
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
      const result = await api.post<{ campaignId: string }>(
        '/invites/confirm',
        { token },
        session.access_token,
      );
      router.push(`/campanas/${result.campaignId}`);
    } catch (err) {
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
    <div className="space-y-3">
      <Button
        tone="green"
        size="md"
        fullWidth
        onClick={handle}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Uniéndote…' : 'Unirme a la campaña'}
      </Button>
      {error && <p className="text-sm text-warning-deep">{error}</p>}
    </div>
  );
}
