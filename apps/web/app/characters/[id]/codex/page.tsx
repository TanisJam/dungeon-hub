import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';
import { ProgressBar } from '@/components/ui/progress-bar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodexCounts {
  monsters: { known: number; total: number };
}

// ---------------------------------------------------------------------------
// Page — REQ-CCB-WEB-01
// ---------------------------------------------------------------------------

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * Character Codex Grid Page — /characters/:id/codex
 *
 * Slice 1': renders one Monstruos card with "N de M descubiertos" progress.
 * Fetches counts from GET /characters/:id/codex/counts.
 * @375px: card is ≥44px tap target. REQ-CCB-WEB-01.
 */
export default async function CharacterCodexPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  let counts: CodexCounts;
  try {
    counts = await api.get<CodexCounts>(
      `/characters/${id}/codex/counts`,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 403) {
        return (
          <AppShell title="Códex" constructorHref="/characters/new">
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-ink">No tenés acceso a este personaje.</p>
            </div>
          </AppShell>
        );
      }
    }
    return (
      <AppShell title="Códex" constructorHref="/characters/new">
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-ink">Error al cargar el códex.</p>
        </div>
      </AppShell>
    );
  }

  const { monsters } = counts;

  return (
    <AppShell title="Códex" constructorHref="/characters/new">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-ink">Códex del personaje</h1>
          <p className="text-sm text-ink-mute">Categorías de conocimiento descubiertas</p>
        </div>

        {/* Category grid — REQ-CCB-WEB-01 */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Monstruos card */}
          <Link
            href={`/characters/${id}/codex/monsters`}
            className="flex min-h-[80px] flex-col justify-between rounded-xl border border-line bg-paper p-4 hover:bg-paper-soft transition-colors"
            aria-label={`Monstruos: ${monsters.known} de ${monsters.total} descubiertos`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Monstruos</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-ink-mute">
                MM
              </span>
            </div>
            <div className="mt-2">
              <p className="text-xs text-ink-mute">
                {monsters.known} de {monsters.total} descubiertos
              </p>
              {/* Progress bar */}
              <ProgressBar
                value={monsters.known}
                max={monsters.total}
                tone="primary"
                className="mt-1"
                ariaLabel="Monstruos descubiertos"
              />
            </div>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
