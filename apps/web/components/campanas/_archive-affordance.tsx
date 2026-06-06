'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

type State = 'idle' | 'loading' | 'error';

type Props = {
  campaignId: string;
  status: 'active' | 'archived';
};

export function ArchiveAffordance({ campaignId, status }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>('idle');

  async function handle() {
    setState('loading');
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const endpoint =
        status === 'active'
          ? `/campaigns/${campaignId}/archive`
          : `/campaigns/${campaignId}/unarchive`;

      await api.post(endpoint, {}, session.access_token);
      setState('idle');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  const label = status === 'active' ? 'Cerrar campaña' : 'Reabrir campaña';

  return (
    <div className="mt-3">
      <Button
        tone="ghost"
        size="md"
        fullWidth
        onClick={handle}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Procesando…' : label}
      </Button>
    </div>
  );
}
