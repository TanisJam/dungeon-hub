'use client';

// Dev-only email + password sign-in. Posts to /api/dev/login (which signs in via
// Supabase password grant and sets the @supabase/ssr cookies). That route is gated
// to NODE_ENV !== 'production', and this form is only rendered in dev (see page.tsx),
// so it never reaches production. Lets a developer log in as a fixture user
// (e.g. player1@dh.test) without going through Discord OAuth.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

const inputClass =
  'w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-base text-ink ' +
  'placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-accent/50';
const labelClass =
  'block text-[10px] font-bold uppercase tracking-widest text-ink-mute mb-1';

export function DevLoginForm({ redirectTo = '/inicio' }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('player1@dh.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dev/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push(redirectTo);
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? 'No se pudo iniciar sesión.');
    } catch {
      setError('Error de red.');
    }
    setLoading(false);
  }

  return (
    <form
      onSubmit={handle}
      className="mt-6 w-full rounded-md bg-surface border border-line shadow-stamp-md p-4 text-left"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-mute mb-3">
        Dev — Email + Contraseña
      </p>

      <label htmlFor="dev-email" className={labelClass}>
        Email
      </label>
      <input
        id="dev-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        className={inputClass}
        placeholder="player1@dh.test"
      />

      <label htmlFor="dev-password" className={`${labelClass} mt-3`}>
        Contraseña
      </label>
      <input
        id="dev-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        className={inputClass}
        placeholder="••••••••"
      />

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <Button
        type="submit"
        tone="green"
        size="md"
        disabled={loading}
        className="mt-4 w-full"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}
