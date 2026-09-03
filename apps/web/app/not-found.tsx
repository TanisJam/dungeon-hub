import Link from 'next/link';

/**
 * Branded 404 page (REQ-UXP1-404-01).
 * Server component. Dark theme tokens (bg-paper/text-ink/border-line — see topbar.tsx).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-ink">
      <h1 className="font-display text-lg font-bold text-ink">Página no encontrada</h1>
      <p className="font-sans text-sm text-ink-mute">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        href="/inicio"
        className="mt-2 flex min-h-[44px] items-center rounded-md border border-line bg-ink px-6 py-2 font-sans text-sm font-medium text-paper"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
