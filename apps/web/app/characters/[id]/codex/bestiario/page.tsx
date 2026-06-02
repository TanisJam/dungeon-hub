import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { api, ApiError } from '@/lib/api';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Player bestiary codex page.
 *
 * REQ-CK-WEB-01, REQ-CK-WEB-02 (spec #1626, character-codex)
 * HOUSE RULE: statblock gating per character — no RAW basis (PHB p.177-179).
 *
 * Server Component — resolves character + bestiary server-side.
 * Active character is resolved via URL :id param (REQ-CK-WEB-02 — cookie deferred).
 *
 * Layout: known monsters (name, CR, type) + silhouette tiles for DM (unknown rows
 * shown as "???" with locked glyph) + "N de M descubiertos" progress footer.
 *
 * @375px: tap targets ≥ 44px (mobile-first).
 *
 * IMPORTANT: The player payload MUST NOT contain statblock data for unknown monsters.
 * The API gate (readBestiary) enforces this server-side — only known monsters are
 * returned for player effectiveView. This page renders only what the API sends.
 */

type WorldCallerRole = 'gm' | 'player' | null;
type WorldDetailLite = { callerRole: WorldCallerRole };

export interface BestiaryMonster {
  slug: string;
  source: string;
  name: string;
  cr: string | null;
  type: string | null;
  size: string | null;
  known: boolean;
}

export interface BestiaryResponse {
  monsters: BestiaryMonster[];
  total: number;
  knownCount: number;
  effectiveView: 'dm' | 'player';
}

const SIZE_LABELS: Record<string, string> = {
  T: 'Diminuto',
  S: 'Pequeño',
  M: 'Mediano',
  L: 'Grande',
  H: 'Enorme',
  G: 'Gargantuesco',
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BestiarioPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/');

  // Resolve callerRole for the DM grant affordance gate
  let callerRole: WorldCallerRole = null;

  let bestiary: BestiaryResponse;
  try {
    bestiary = await api.get<BestiaryResponse>(
      `/characters/${id}/knowledge/bestiary`,
      session.access_token,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 404) notFound();
      if (err.status === 403) {
        return (
          <AppShell title="Bestiario" constructorHref="/characters/new">
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-ink">No tenés acceso a este personaje.</p>
            </div>
          </AppShell>
        );
      }
    }
    return (
      <AppShell title="Bestiario" constructorHref="/characters/new">
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-ink">Error al cargar el bestiario.</p>
        </div>
      </AppShell>
    );
  }

  // Best-effort callerRole for DM grant affordance
  try {
    // We need the world ID — fetch from character sheet endpoint
    const worldInfo = await api.get<{ callerRole: WorldCallerRole }>(
      `/characters/${id}/sheet`,
      session.access_token,
    ).then((r: unknown) => {
      const res = r as { character?: { worldId?: string }; callerRole?: WorldCallerRole };
      return res;
    });
    const sheetData = worldInfo as { callerRole?: WorldCallerRole };
    if (sheetData.callerRole) {
      callerRole = sheetData.callerRole;
    }
  } catch {
    // Ignore — best-effort
  }

  // Derive callerRole from effectiveView as fallback
  if (callerRole === null) {
    callerRole = bestiary.effectiveView === 'dm' ? 'gm' : 'player';
  }

  const { monsters, total, knownCount, effectiveView } = bestiary;

  return (
    <AppShell title="Bestiario" constructorHref="/characters/new">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-ink">Bestiario</h1>
            <p className="text-sm text-ink-mute">
              {knownCount} de {total} descubiertos
            </p>
          </div>
          {/* Progress bar */}
          <div className="h-2 w-24 overflow-hidden rounded-full bg-paper-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${total > 0 ? Math.round((knownCount / total) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Monster list */}
        {monsters.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line py-10 text-center">
            <p className="text-sm text-ink-mute">
              {effectiveView === 'dm'
                ? 'No hay monstruos en el compendio todavía.'
                : 'No has descubierto ningún monstruo aún.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-paper">
            {monsters.map((m) => (
              <li key={`${m.slug}|${m.source}`}>
                {m.known ? (
                  /* Known monster — full name + CR + type */
                  <div
                    className="flex min-h-[44px] items-center gap-3 px-4 py-3"
                    data-monster-slug={m.slug}
                    data-monster-source={m.source}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                      <p className="text-xs text-ink-mute">
                        {[
                          m.cr ? `CR ${m.cr}` : null,
                          m.type ?? null,
                          m.size ? SIZE_LABELS[m.size] ?? m.size : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-mute">
                      {m.source}
                    </span>
                  </div>
                ) : (
                  /* Silhouette — DM view only (player API never returns unknown rows) */
                  /* CRITICAL: name="???" — NO statblock data. CR/type/size are mild meta,
                     not the gated payload (the statblock). Anti-metagaming maintained. */
                  <div className="flex min-h-[44px] items-center gap-3 px-4 py-3 opacity-40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-mute">???</p>
                      <p className="text-xs text-ink-mute">
                        {[
                          m.cr ? `CR ${m.cr}` : null,
                          m.type ?? null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <span aria-label="No descubierto" className="text-ink-mute">
                      🔒
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Footer progress */}
        <p className="mt-4 text-center text-xs text-ink-mute">
          {knownCount} de {total} descubiertos
        </p>
      </div>
    </AppShell>
  );
}
