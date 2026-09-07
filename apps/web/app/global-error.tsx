'use client';

// Root-layout error boundary (REQ: demo-resilience). Next.js only invokes
// global-error.tsx when the ROOT layout itself throws, so this file must
// render its own <html>/<body> and cannot depend on app/layout.tsx (fonts,
// providers, etc.) — kept deliberately minimal and self-contained. It still
// imports globals.css directly so the Tailwind design tokens (bg-paper,
// text-ink, ...) are available without the layout's Google Fonts wiring.

import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center justify-center px-4 py-16 text-center md:max-w-md">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
            El mundo está temporalmente inalcanzable
          </h1>
          <p className="mt-3 text-sm text-ink-mute">
            Algo salió mal al cargar Dungeon Hub. Puede ser un problema pasajero con el
            servidor — probá de nuevo en unos segundos.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-transparent bg-gradient-to-br from-accent to-secondary px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(232,148,111,0.35),0_1px_2px_rgba(39,30,51,0.08)] transition-all hover:brightness-105 active:translate-y-px"
            >
              Reintentar
            </button>
            <a
              href="/"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-line bg-transparent px-4 py-2.5 text-sm font-bold text-ink-soft transition-all hover:bg-paper-soft active:translate-y-px"
            >
              Volver al inicio
            </a>
          </div>

          {error.digest && (
            <p className="mt-6 text-[11px] text-ink-mute">
              Código de referencia: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
