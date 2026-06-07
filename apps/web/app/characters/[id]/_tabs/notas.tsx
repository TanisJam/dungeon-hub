/**
 * NotasTab — Bitácora tab (Server Component).
 *
 * Two segmented sub-views: Conocidos | Páginas.
 * Sub-view selected via ?sub= search param (SSR, Server-Component-first).
 *
 * SSR-fetches (parallel, best-effort):
 *   - Known monsters:  GET /characters/:id/knowledge/monsters
 *   - Known NPCs:      GET /characters/:id/knowledge/npcs (uuid-bridge-npc B-3)
 *   - Known factions:  GET /characters/:id/knowledge/factions (uuid-bridge-factions-pois B-3)
 *   - Known locations: GET /characters/:id/knowledge/locations (uuid-bridge-factions-pois B-3)
 *   - Bitácora pages:  GET /characters/:id/bitacora/pages
 *
 * Hands SSR data to client sub-view components (ConocidosView, PaginasView).
 *
 * bitacora-personal SDD spec #1974 REQ-BP-WEB-01 / REQ-BP-WEB-02 / REQ-BP-WEB-03.
 * uuid-bridge-npc spec #2002 REQ-UBN-CONOCIDOS / REQ-UBN-BITACORA.
 * uuid-bridge-factions-pois spec #2011 REQ-UBFP-CONOCIDOS / REQ-UBFP-BITACORA.
 * No PHB rule — anti-metagaming design principle.
 */

import Link from 'next/link';
import { api } from '@/lib/api';
import { ConocidosView, type KnownMonsterHit } from './_components/conocidos-view';
import { PaginasView, type BitacoraPageItem } from './_components/paginas-view';
import type { KnownMonster, KnownNpc, KnownFaction, KnownLocation } from './_components/bitacora-composer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnowledgeMonstersResponse {
  rows: KnownMonsterHit[];
  total: number;
  knownCount: number;
}

/** NPC row shape from GET /characters/:id/knowledge/npcs (CodexNpcRow — no dmNotes). */
export interface CodexNpcRowSSR {
  id: string;
  name: string;
  race: string | null;
  status: 'alive' | 'dead' | 'missing' | 'unknown';
  description: string | null;
  known: boolean;
  // NO dmNotes — CodexNpcRow structurally excludes it (ADR-6, REQ-UBN-SECURITY)
}

/** Faction row shape from GET /characters/:id/knowledge/factions (CodexFactionRow — no dmNotes). */
export interface CodexFactionRowSSR {
  id: string;
  name: string;
  state: string;
  description: string | null;
  known: boolean;
  // NO dmNotes — CodexFactionRow structurally excludes it (ADR-6, REQ-UBFP-SECURITY)
}

/** Location (POI) row shape from GET /characters/:id/knowledge/locations (CodexLocationRow — no dmNotes/parentHexStatus). */
export interface CodexLocationRowSSR {
  id: string;
  name: string;
  status: string;
  description: string | null;
  known: boolean;
  // NO dmNotes — CodexLocationRow structurally excludes it (ADR-6, REQ-UBFP-SECURITY)
  // NO parentHexStatus — MUST NOT reach the wire (C10, ADR-1b)
}

interface KnowledgeNpcsResponse {
  rows: CodexNpcRowSSR[];
  total: number;
  knownCount: number;
}

interface KnowledgeFactionsResponse {
  rows: CodexFactionRowSSR[];
  total: number;
  knownCount: number;
}

interface KnowledgeLocationsResponse {
  rows: CodexLocationRowSSR[];
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
  worldId,
  accessToken,
  callerRole: _callerRole,
  sub,
}: NotasTabProps) {
  // SSR-fetch all data sets in parallel (best-effort — on failure show empty state)
  // uuid-bridge-npc B-3: added NPC knowledge fetch alongside monsters.
  // uuid-bridge-factions-pois B-3: added factions + locations knowledge fetches.
  const [monstersResult, npcsResult, factionsResult, locationsResult, pagesResult] = await Promise.allSettled([
    api.get<KnowledgeMonstersResponse>(
      `/characters/${characterId}/knowledge/monsters`,
      accessToken,
    ),
    api.get<KnowledgeNpcsResponse>(
      `/characters/${characterId}/knowledge/npcs`,
      accessToken,
    ),
    api.get<KnowledgeFactionsResponse>(
      `/characters/${characterId}/knowledge/factions`,
      accessToken,
    ),
    api.get<KnowledgeLocationsResponse>(
      `/characters/${characterId}/knowledge/locations`,
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

  // NPC knowledge — player sees only known NPCs (known !== false).
  // CodexNpcRow has NO dmNotes field; web props carry only safe fields (ADR-6 rule).
  const allNpcRows: CodexNpcRowSSR[] =
    npcsResult.status === 'fulfilled' ? npcsResult.value.rows : [];
  const knownNpcs: CodexNpcRowSSR[] = allNpcRows.filter((n) => n.known !== false);

  // Faction knowledge — uuid-bridge-factions-pois B-3.
  // CodexFactionRow has NO dmNotes field; web props carry only safe fields (ADR-6 rule).
  const allFactionRows: CodexFactionRowSSR[] =
    factionsResult.status === 'fulfilled' ? factionsResult.value.rows : [];
  const knownFactions: CodexFactionRowSSR[] = allFactionRows.filter((f) => f.known !== false);

  // Location knowledge — uuid-bridge-factions-pois B-3.
  // CodexLocationRow has NO dmNotes, NO parentHexStatus; web props carry only safe fields.
  const allLocationRows: CodexLocationRowSSR[] =
    locationsResult.status === 'fulfilled' ? locationsResult.value.rows : [];
  const knownLocations: CodexLocationRowSSR[] = allLocationRows.filter((l) => l.known !== false);

  const pages: BitacoraPageItem[] =
    pagesResult.status === 'fulfilled' ? pagesResult.value.pages : [];

  // Known monsters list for the composer ref picker (known-only, UI discoverability gate)
  const knownMonstersForComposer: KnownMonster[] = knownOnly.map((m) => ({
    slug: m.slug,
    source: m.source,
    name: m.name,
  }));

  // Known NPCs for the composer ref picker — project to {id, name} only (ADR-6 rule).
  const knownNpcsForComposer: KnownNpc[] = knownNpcs.map((n) => ({
    id: n.id,
    name: n.name,
  }));

  // Known factions for the composer ref picker — project to {id, name, state} only (ADR-6).
  const knownFactionsForComposer: KnownFaction[] = knownFactions.map((f) => ({
    id: f.id,
    name: f.name,
    state: f.state,
    // dmNotes intentionally absent — CodexFactionRowSSR structurally excludes it (ADR-6)
  }));

  // Known locations for the composer ref picker — project to {id, name, status} only (ADR-6).
  const knownLocationsForComposer: KnownLocation[] = knownLocations.map((l) => ({
    id: l.id,
    name: l.name,
    status: l.status,
    // dmNotes + parentHexStatus intentionally absent (ADR-6, C10)
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
          npcs={knownNpcs}
          factions={knownFactions}
          locations={knownLocations}
          pages={pages}
          worldId={worldId}
          accessToken={accessToken}
        />
      ) : (
        <PaginasView
          characterId={characterId}
          pages={pages}
          knownMonsters={knownMonstersForComposer}
          knownNpcs={knownNpcsForComposer}
          knownFactions={knownFactionsForComposer}
          knownLocations={knownLocationsForComposer}
          worldId={worldId}
          accessToken={accessToken}
        />
      )}
    </div>
  );
}
