'use client';

// Route-segment error boundary (REQ: demo-resilience). Catches any rendering
// or data-fetching failure below the root layout — most commonly the
// home-lab backend (Fastify API / self-hosted Supabase) being slow or
// unreachable — and shows a calm, on-brand message instead of Next's raw
// "Application error" page. Client component per Next.js error.tsx contract.

import { useEffect } from 'react';
import { Button, CrowMark, Icon } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app/error] route segment crashed:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col items-center justify-center px-4 py-16 text-center md:max-w-md">
      <div className="mb-6">
        <CrowMark />
      </div>

      <span className="grid h-12 w-12 place-items-center rounded-md border border-line bg-surface text-ink-mute">
        <Icon name="bolt" size={22} />
      </span>

      <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-ink">
        El mundo está temporalmente inalcanzable
      </h1>
      <p className="mt-3 text-sm text-ink-mute">
        No pudimos cargar esta página. Puede ser un problema pasajero con el servidor —
        probá de nuevo en unos segundos.
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        <Button tone="cta" size="md" fullWidth onClick={reset}>
          Reintentar
        </Button>
        <Button tone="ghost" size="md" fullWidth asChild href="/">
          Volver al inicio
        </Button>
      </div>

      {error.digest && (
        <p className="mt-6 text-[11px] text-ink-mute">
          Código de referencia: {error.digest}
        </p>
      )}
    </main>
  );
}
