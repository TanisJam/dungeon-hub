/**
 * NotasTab — Bitácora tab (Server Component).
 *
 * Two segmented sub-views: Conocidos | Páginas.
 * Sub-view selected via ?sub= search param (SSR, Server-Component-first).
 *
 * SSR-fetches:
 *   - Known monsters: GET /characters/:id/knowledge/monsters (gated by character_knowledge)
 *   - Bitácora pages: GET /characters/:id/bitacora/pages
 *
 * Hands SSR data to client sub-view components (ConocidosView, PaginasView).
 *
 * bitacora-personal SDD spec #1974 REQ-BP-WEB-01 / REQ-BP-WEB-02 / REQ-BP-WEB-03,
 * design #1975 §ADR-4 / §ADR-5.
 * No PHB rule — anti-metagaming design principle.
 */

import Link from 'next/link';
import { api } from '@/lib/api';
import { ConocidosView, type KnownMonsterHit } from './_components/conocidos-view';
import { PaginasView, type BitacoraPageItem } from './_components/paginas-view';
import type { KnownMonster } from './_components/bitacora-composer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnowledgeMonstersResponse {
  rows: KnownMonsterHit[];
  total: number;
  knownCount: number;
}

interface BitacoraPagesResponse {
  pages: BitacoraPageItem[];
  total: number;
}

export interface NotasTabProps {
  characterId: string;
  worldId: string;
  accessToken: string;
  callerRole: 'gm' | 'player' | null;
  sub: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export async function NotasTab({
  characterId,
  worldId: _worldId,
  accessToken,
  callerRole: _callerRole,
  sub,
}: NotasTabProps) {
  // SSR-fetch both data sets in parallel (best-effort — on failure show empty state)
  const [monstersResult, pagesResult] = await Promise.allSettled([
    api.get<KnowledgeMonstersResponse>(
      `/characters/${characterId}/knowledge/monsters`,
      accessToken,
    ),
    api.get<BitacoraPagesResponse>(
      `/characters/${characterId}/bitacora/pages`,
      accessToken,
    ),
  ]);

  const knownMonsters: KnownMonsterHit[] =
    monstersResult.status === 'fulfilled' ? monstersResult.value.rows : [];

  // Player view: API returns only known monsters; DM/devMode returns all with known flag.
  // Filter to known-only for Conocidos display — avoids showing ungranted monsters.
  const knownOnly: KnownMonsterHit[] = knownMonsters.filter((m) => m.known !== false);

  const pages: BitacoraPageItem[] =
    pagesResult.status === 'fulfilled' ? pagesResult.value.pages : [];

  // Known monsters list for the composer ref picker (known-only, UI discoverability gate)
  const knownMonstersForComposer: KnownMonster[] = knownOnly.map((m) => ({
    slug: m.slug,
    source: m.source,
    name: m.name,
  }));

  const activeConocidos = sub !== 'paginas';

  return (
    <div className="flex flex-col gap-4">
      {/* Segmented sub-nav — Conocidos | Páginas. Full-width, ≥44px tap targets. REQ-BP-WEB-01 */}
      <nav
        aria-label="Sub-secciones de Bitácora"
        className="flex w-full rounded-lg border border-line bg-paper-soft p-1 gap-1"
      >
        <Link
          href={`/characters/${characterId}?tab=notas&sub=conocidos`}
          className={[
            'flex-1 rounded-md py-2 text-center text-sm font-semibold transition-colors min-h-[44px] flex items-center justify-center',
            activeConocidos
              ? 'bg-ink text-paper'
              : 'text-ink-mute hover:text-ink',
          ].join(' ')}
          aria-current={activeConocidos ? 'page' : undefined}
        >
          Conocidos
        </Link>
        <Link
          href={`/characters/${characterId}?tab=notas&sub=paginas`}
          className={[
            'flex-1 rounded-md py-2 text-center text-sm font-semibold transition-colors min-h-[44px] flex items-center justify-center',
            !activeConocidos
              ? 'bg-ink text-paper'
              : 'text-ink-mute hover:text-ink',
          ].join(' ')}
          aria-current={!activeConocidos ? 'page' : undefined}
        >
          Páginas
        </Link>
      </nav>

      {/* Sub-views */}
      {activeConocidos ? (
        <ConocidosView
          characterId={characterId}
          monsters={knownOnly}
          pages={pages}
        />
      ) : (
        <PaginasView
          characterId={characterId}
          pages={pages}
          knownMonsters={knownMonstersForComposer}
        />
      )}
    </div>
  );
}
