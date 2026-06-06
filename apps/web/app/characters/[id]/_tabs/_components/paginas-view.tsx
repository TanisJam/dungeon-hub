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

import { useState } from 'react';
import { KNOWLEDGE_TAGS } from '@dungeon-hub/domain/world/codex';
import { BitacoraComposer, type KnownMonster, type BitacoraPageRef } from './bitacora-composer';
import { deleteBitacoraPage } from '../../actions';

export interface BitacoraPageItem {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  refs: BitacoraPageRef[];
  createdAt: string;
  updatedAt: string;
}

interface PaginasViewProps {
  characterId: string;
  pages: BitacoraPageItem[];
  knownMonsters: KnownMonster[];
}

export function PaginasView({ characterId, pages, knownMonsters }: PaginasViewProps) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editPage, setEditPage] = useState<BitacoraPageItem | null>(null);
  const [detailPage, setDetailPage] = useState<BitacoraPageItem | null>(null);
  const [localPages, setLocalPages] = useState<BitacoraPageItem[]>(pages);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  function getSnippet(body: string) {
    if (body.length <= 120) return body;
    return body.slice(0, 120) + '…';
  }

  // Detail view
  if (detailPage) {
    const monster = knownMonsters.find((m) =>
      detailPage.refs.some((r) => r.kind === 'monster' && r.refKey === m.slug && r.refSource === m.source),
    );

    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setDetailPage(null)}
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
            <p className="text-xs text-ink-mute font-medium">
              Monstruo: <span className="text-ink">{monster.name}</span>
            </p>
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
        </div>

        <BitacoraComposer
          characterId={characterId}
          knownMonsters={knownMonsters}
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
        editPage={editPage ?? undefined}
        open={composerOpen}
        onClose={handleComposerClose}
      />
    </div>
  );
}
