import Link from 'next/link';
import { Card } from '@/components/ui';

export default function AuthErrorPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <Card variant="surface" className="p-6 text-center">
        <h1 className="font-display text-xl font-bold text-ink">Error de autenticación</h1>
        <p className="mt-3 text-sm text-ink-mute">
          No pudimos completar el inicio de sesión. Intentá de nuevo desde la página principal.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-semibold text-primary hover:text-primary-deep transition-colors"
        >
          ← Volver al inicio
        </Link>
      </Card>
    </main>
  );
}
