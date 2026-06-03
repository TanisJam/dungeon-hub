import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api } from '@/lib/api';
import { getActiveWorld } from '@/lib/active-world';
import { getViewPreference } from '@/lib/role';
import { getActiveCharacter } from '@/lib/active-character';
import { AppShell } from '@/components/layout/app-shell';
import { V3Empty } from '@/components/ui';
import { PlayerCodexGrid } from './_components/player-codex-grid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RosterRow = { id: string };

// ---------------------------------------------------------------------------
// Page — role-aware dispatch (codex-rehome ADR-4, REQ-DISPATCH-01)
// ---------------------------------------------------------------------------

/**
 * CodexPage — role-aware entry point for the Codex tab.
 * codex-rehome ADR-4: Promise.all([getActiveWorld, getViewPreference, getActiveCharacter])
 *
 * effectiveView formula (canonical — matches Facciones, Inicio, etc.):
 *   aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player'
 *
 * DM (effectiveView='dm') → redirect('/codex/facciones') — UNCHANGED behavior.
 * PLAYER / DM-toggled-to-player:
 *   - activeChar present → 6-card PlayerCodexGrid (REQ-GRID-01)
 *   - no activeChar     → V3Empty + CTA (REQ-EMPTY-01)
 */
export default async function CodexPage() {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Parallel fetches — latency optimization (REQ-DISPATCH-01, ADR-4)
  const [aw, viewPref, activeChar] = await Promise.all([
    getActiveWorld(token),
    getViewPreference(),
    getActiveCharacter(token),
  ]);

  // Canonical effectiveView formula (ADR-4, consistent with /codex/facciones + /inicio)
  const effectiveView =
    aw?.callerRole === 'gm' ? (viewPref === 'player' ? 'player' : 'dm') : 'player';

  // DM → redirect to DM authoring surface (UNCHANGED, REQ-DISPATCH-01 scenario "DM at /codex")
  if (effectiveView === 'dm') {
    redirect('/codex/facciones');
  }

  // PLAYER path — active character present (REQ-GRID-01, scenario "Player with active char")
  if (activeChar) {
    return (
      <AppShell title="Códex" subtitle="COMPENDIO">
        <PlayerCodexGrid />
      </AppShell>
    );
  }

  // PLAYER path — no active character (REQ-EMPTY-01)
  // Determine CTA: if user has any characters → /personajes (choose one);
  // zero characters → /characters/new (create first).
  let ctaHref = '/characters/new';
  try {
    const roster = await api.get<{ data: RosterRow[] }>('/characters', token!);
    if ((roster.data?.length ?? 0) > 0) {
      ctaHref = '/personajes';
    }
  } catch {
    // Fallback: treat as zero chars — offer create flow
  }

  return (
    <AppShell title="Códex" subtitle="COMPENDIO">
      <V3Empty
        glyph="user"
        title="Todavía no tenés un personaje activo"
        sub="El Códex se centra en tu personaje activo."
        cta={{ label: 'Elegí o creá un personaje', href: ctaHref }}
      />
    </AppShell>
  );
}
