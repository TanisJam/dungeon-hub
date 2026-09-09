'use client';

/**
 * PaginasView — client component for the Páginas sub-view.
 *
 * Shows a list of bitácora pages with tag-filter pills, tap-to-detail,
 * and a FAB/button to open the composer.
 *
 * Uses SSR-fetched data passed as props (no client-side fetching).
 * Tag filter is client-side (no round-trip needed for small collections).
 *
 * bitacora-personal SDD spec #1974 REQ-BP-WEB-03, design #1975 §ADR-5.
 */

import { useEffect, useState } from 'react';
import { KNOWLEDGE_TAGS } from '@dungeon-hub/domain/world/codex';
import { DetailSheet } from '@/app/compendium/[category]/_components/detail-sheet';
import { CATEGORY_CONFIG } from '@/app/compendium/[category]/_config/registry';
import { BitacoraComposer, type KnownMonster, type KnownNpc, type KnownFaction, type KnownLocation, type BitacoraPageRef } from './bitacora-composer';
import { deleteBitacoraPage, shareBitacoraPage } from '../../actions';

export interface BitacoraPageItem {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  refs: BitacoraPageRef[];
  createdAt: string;
  updatedAt: string;
  /**
   * ISO string of when this page was first shared to the guild (non-sealed copy).
   * Derived server-side via EXISTS subquery on guild_contributions (ADR-8).
   * null when the page has never been shared (or the only share was sealed).
   * bitacora-personal-share REQ-SHARE-10.
   */
  sharedAt?: string | null;
}

const _NPC_STATUS_LABELS: Record<string, string> = {
  alive: 'Vivo',
  dead: 'Muerto',
  missing: 'Desaparecido',
  unknown: 'Desconocido',
};

const FACTION_STATE_LABELS: Record<string, string> = {
  active: 'Activa',
  dormant: 'Durmiente',
  destroyed: 'Destruida',
  disbanded: 'Disuelta',
};

const POI_STATUS_LABELS: Record<string, string> = {
  known: 'Conocido',
  rumored: 'Rumoreado',
  hidden: 'Oculto',
  unknown: 'Desconocido',
};

interface PaginasViewProps {
  characterId: string;
  pages: BitacoraPageItem[];
  knownMonsters: KnownMonster[];
  /** Known NPCs for the ref picker and NPC linked-entity card. uuid-bridge-npc B-3. */
  knownNpcs?: KnownNpc[];
  /** Known factions for the ref picker and faction linked-entity card. uuid-bridge-factions-pois B-3. */
  knownFactions?: KnownFaction[];
  /** Known locations (POIs) for the ref picker and location linked-entity card. uuid-bridge-factions-pois B-3. */
  knownLocations?: KnownLocation[];
  worldId: string;
  accessToken: string;
}

export function PaginasView({ characterId, pages, knownMonsters, knownNpcs = [], knownFactions = [], knownLocations = [], worldId, accessToken }: PaginasViewProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editPage, setEditPage] = useState<BitacoraPageItem | null>(null);
  const [detailPage, setDetailPage] = useState<BitacoraPageItem | null>(null);
  const [localPages, setLocalPages] = useState<BitacoraPageItem[]>(pages);
  // Re-sync from the server prop after revalidatePath (e.g. a newly created page).
  // Optimistic edits (delete/share) update localPages directly; revalidation then
  // converges this mirror to the server's truth.
  useEffect(() => {
    setLocalPages(pages);
  }, [pages]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [statblockOpen, setStatblockOpen] = useState(false);
  // Share flow state — mobile-first confirm panel (REQ-SHARE-10 ADR-7)
  const [confirmShare, setConfirmShare] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const filteredPages = activeTag
    ? localPages.filter((p) => p.tags.includes(activeTag))
    : localPages;

  function openComposer() {
    setEditPage(null);
    setComposerOpen(true);
  }

  function openEdit(page: BitacoraPageItem) {
    setDetailPage(null);
    setEditPage(page);
    setComposerOpen(true);
    setConfirmShare(false);
    setShareError(null);
  }

  function handleComposerClose() {
    setComposerOpen(false);
    setEditPage(null);
    // Refresh happens via router revalidation from Server Action
  }

  async function handleDelete(pageId: string) {
    if (deleting) return;
    setDeleting(pageId);
    const result = await deleteBitacoraPage(characterId, pageId);
    setDeleting(null);
    if (result.ok) {
      setLocalPages((prev) => prev.filter((p) => p.id !== pageId));
      setDetailPage(null);
    }
  }

  async function handleShare(page: BitacoraPageItem) {
    if (sharing) return;
    setSharing(true);
    setShareError(null);
    const result = await shareBitacoraPage(characterId, page.id);
    setSharing(false);
    if (result.ok) {
      // Update localPages: mark page as shared with current timestamp
      const now = new Date().toISOString();
      const updated = { ...page, sharedAt: now };
      setLocalPages((prev) => prev.map((p) => (p.id === page.id ? updated : p)));
      setDetailPage(updated);
      setConfirmShare(false);
    } else {
      setShareError(result.error);
    }
  }

  function getSnippet(body: string) {
    if (body.length <= 120) return body;
    return body.slice(0, 120) + '…';
  }

  // Detail view
  if (detailPage) {
    const monster = knownMonsters.find((m) =>
      detailPage.refs.some((r) => r.kind === 'monster' && r.refKey === m.slug && r.refSource === m.source),
    );

    // NPC linked entity — uuid-bridge-npc B-3 (ADR-5, REQ-UBN-BITACORA linked-entity scenario).
    // Resolved from knownNpcs (sourced from sanitized codex/npcs — NO dmNotes, ADR-6 path #5).
    const linkedNpc = knownNpcs.find((n) =>
      detailPage.refs.some((r) => r.kind === 'npc' && r.refKey === n.id && r.refSource === 'world'),
    );

    // Faction linked entity — uuid-bridge-factions-pois B-3 (REQ-UBFP-BITACORA linked-entity).
    // Resolved from knownFactions ({id, name, state} only — NO dmNotes, ADR-6).
    const linkedFaction = knownFactions.find((f) =>
      detailPage.refs.some((r) => r.kind === 'faction' && r.refKey === f.id && r.refSource === 'world'),
    );

    // Location linked entity — uuid-bridge-factions-pois B-3 (REQ-UBFP-BITACORA linked-entity).
    // Resolved from knownLocations ({id, name, status} only — NO dmNotes, NO parentHexStatus, ADR-6 + C10).
    const linkedLocation = knownLocations.find((l) =>
      detailPage.refs.some((r) => r.kind === 'location' && r.refKey === l.id && r.refSource === 'world'),
    );

    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => { setDetailPage(null); setConfirmShare(false); setShareError(null); }}
          className="flex items-center gap-1 text-sm text-ink-mute hover:text-ink transition-colors min-h-[44px]"
        >
          <span aria-hidden="true">←</span>
          <span>Mis páginas</span>
        </button>

        <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
          {detailPage.title && (
            <h2 className="text-base font-semibold text-ink">{detailPage.title}</h2>
          )}
          {monster && (
            <button
              type="button"
              onClick={() => setStatblockOpen(true)}
              className="self-start rounded-md border border-line bg-paper-soft px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper transition-colors"
              aria-label={`Ver ficha de ${monster.name}`}
            >
              Monstruo: <span className="text-accent">{monster.name}</span> →
            </button>
          )}
          {/* NPC linked-entity inline card (NOT statblock, ADR-5 D3, ADR-6 path #5). */}
          {linkedNpc && (
            <div className="rounded-md border border-line bg-paper-soft px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1">NPC</p>
              <p className="text-sm font-medium text-ink">{linkedNpc.name}</p>
              {/* dmNotes intentionally absent — KnownNpc carries only {id, name} (ADR-6) */}
            </div>
          )}
          {/* Faction linked-entity inline card — uuid-bridge-factions-pois B-3 (REQ-UBFP-BITACORA). */}
          {/* dmNotes intentionally absent — KnownFaction carries only {id, name, state} (ADR-6). */}
          {linkedFaction && (
            <div className="rounded-md border border-line bg-paper-soft px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1">Facción</p>
              <p className="text-sm font-medium text-ink">{linkedFaction.name}</p>
              <p className="text-xs text-ink-mute mt-0.5">
                {FACTION_STATE_LABELS[linkedFaction.state] ?? linkedFaction.state}
              </p>
            </div>
          )}
          {/* Location linked-entity inline card — uuid-bridge-factions-pois B-3 (REQ-UBFP-BITACORA). */}
          {/* dmNotes + parentHexStatus intentionally absent — KnownLocation carries only {id, name, status} (ADR-6, C10). */}
          {linkedLocation && (
            <div className="rounded-md border border-line bg-paper-soft px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1">Lugar</p>
              <p className="text-sm font-medium text-ink">{linkedLocation.name}</p>
              <p className="text-xs text-ink-mute mt-0.5">
                {POI_STATUS_LABELS[linkedLocation.status] ?? linkedLocation.status}
              </p>
            </div>
          )}
          <p className="text-sm text-ink whitespace-pre-wrap">{detailPage.body}</p>
          {detailPage.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {detailPage.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-line bg-paper-soft px-2.5 py-0.5 text-xs text-ink-mute"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => openEdit(detailPage)}
              className="flex-1 min-h-[44px] rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink hover:bg-paper transition-colors"
            >
              Editar
            </button>
            <button
              type="button"
              disabled={deleting === detailPage.id}
              onClick={() => handleDelete(detailPage.id)}
              className="flex-1 min-h-[44px] rounded-md border border-red-200 bg-paper-soft px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting === detailPage.id ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>

          {/* Share affordance — mobile-first 375px (REQ-SHARE-10 ADR-7) */}
          {detailPage.sharedAt != null ? (
            // Already shared: show read-only Compartido badge (no re-share button)
            <div className="mt-2 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2">
              {/* Decorative checkmark — the adjacent text already conveys the status to SRs */}
              <span className="text-green-600 text-sm" aria-hidden="true">✓</span>
              <span className="text-sm text-green-700 font-medium">Compartido con el gremio</span>
            </div>
          ) : confirmShare ? (
            // Confirm panel — inline, no navigation away (REQ-SHARE-10)
            <div className="mt-2 flex flex-col gap-2 rounded-md border border-line bg-paper-soft p-3">
              <p className="text-sm text-ink">¿Compartir esta página con el gremio?</p>
              {shareError && (
                <p className="text-xs text-red-600">{shareError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={sharing}
                  onClick={() => handleShare(detailPage)}
                  className="flex-1 min-h-[44px] rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors disabled:opacity-50"
                >
                  {sharing ? 'Compartiendo…' : 'Compartir'}
                </button>
                <button
                  type="button"
                  disabled={sharing}
                  onClick={() => { setConfirmShare(false); setShareError(null); }}
                  className="flex-1 min-h-[44px] rounded-md border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            // Share button — full width below Editar/Eliminar row
            <button
              type="button"
              onClick={() => setConfirmShare(true)}
              className="mt-2 w-full min-h-[44px] rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink hover:bg-paper transition-colors"
            >
              Compartir con el gremio
            </button>
          )}
        </div>

        {/* Linked monster statblock — reuses the compendium DetailSheet (Bug #3). */}
        {monster && (
          <DetailSheet
            open={statblockOpen}
            category="monsters"
            row={monster}
            scope={{ world: worldId }}
            worldId={worldId}
            accessToken={accessToken}
            config={CATEGORY_CONFIG.monsters}
            onClose={() => setStatblockOpen(false)}
          />
        )}

        <BitacoraComposer
          characterId={characterId}
          knownMonsters={knownMonsters}
          knownNpcs={knownNpcs}
          knownFactions={knownFactions}
          knownLocations={knownLocations}
          editPage={editPage ?? undefined}
          open={composerOpen}
          onClose={handleComposerClose}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tag filter pills */}
      {localPages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
              activeTag === null
                ? 'bg-ink text-paper border-ink'
                : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
            ].join(' ')}
          >
            Todas
          </button>
          {KNOWLEDGE_TAGS.map((tag) => {
            const hasPages = localPages.some((p) => p.tags.includes(tag));
            if (!hasPages) return null;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
                  activeTag === tag
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
                ].join(' ')}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Page list */}
      {filteredPages.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-ink-mute">
            {activeTag
              ? `No hay páginas con la etiqueta "${activeTag}".`
              : 'Aún no escribiste ninguna página.'}
          </p>
          {!activeTag && (
            <p className="mt-1 text-xs text-ink-soft">
              Usá el botón de abajo para crear tu primera nota.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredPages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setDetailPage(page)}
              className="w-full text-left rounded-xl border border-line bg-surface p-3 flex flex-col gap-1 min-h-[44px] hover:bg-paper transition-colors"
            >
              {page.title && (
                <p className="text-sm font-semibold text-ink">{page.title}</p>
              )}
              <p className="text-xs text-ink-mute line-clamp-2">{getSnippet(page.body)}</p>
              {page.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {page.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-line bg-paper-soft px-2 py-0.5 text-xs text-ink-soft"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Nueva página FAB — visible on 375px */}
      <button
        type="button"
        onClick={openComposer}
        className="flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink hover:bg-paper transition-colors"
        aria-label="Nueva página de bitácora"
      >
        <span aria-hidden="true">＋</span>
        <span>Nueva página</span>
      </button>

      <BitacoraComposer
        characterId={characterId}
        knownMonsters={knownMonsters}
        knownNpcs={knownNpcs}
        knownFactions={knownFactions}
        knownLocations={knownLocations}
        editPage={editPage ?? undefined}
        open={composerOpen}
        onClose={handleComposerClose}
      />
    </div>
  );
}
