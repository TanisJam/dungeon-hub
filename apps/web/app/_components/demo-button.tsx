'use client';

// One-click "Iniciar demo" — signs in as the shared, pre-populated demo account
// via Supabase password grant (the browser client sets the @supabase/ssr cookies,
// so the server components see the session on the next navigation). No Discord
// needed. The demo credentials are intentionally public (shared read/write demo).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import { Icon } from '@/components/ui/icon';

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? 'demo@dungeon-hub.mnr.ar';
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? 'demo1234';

export function DemoButton({ redirectTo = '/inicio' }: { redirectTo?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (error) {
      setError('No se pudo iniciar el demo. Probá de nuevo.');
      setLoading(false);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="mt-3 w-full">
      <Button tone="cta" size="md" onClick={handle} disabled={loading} className="w-full">
        {loading ? (
          'Entrando al demo…'
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Icon name="dice" size={16} /> Iniciar demo
          </span>
        )}
      </Button>
      <p className="mt-2 text-[11px] text-ink-mute">
        Cuenta de ejemplo con un mundo, personajes y bitácora ya poblados.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
