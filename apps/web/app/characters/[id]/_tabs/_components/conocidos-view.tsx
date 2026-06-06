'use client';

/**
 * ConocidosView — client component for the Conocidos sub-view.
 *
 * Shows a list of known monsters (received as SSR-fetched props).
 * Each card shows a note-indicator dot if the character has pages referencing that monster.
 * Tapping a card opens a detail overlay with the monster's page list and a composer shortcut.
 *
 * Reuses MonsterRowView from the compendium for visual consistency.
 * NOTE: Known-only source (character_knowledge gate). DM/devMode sees full catalog via
 * the existing knowledge gate — this component always receives the player-gated list.
 *
 * bitacora-personal SDD spec #1974 REQ-BP-WEB-02 / REQ-BP-WEB-05, design #1975 §ADR-4.
 */

import { useState } from 'react';
import { MonsterRowView } from '@/app/compendium/[category]/_components/row-views';
import { BitacoraComposer, type BitacoraPageRef } from './bitacora-composer';

export interface KnownMonsterHit {
  slug: string;
  source: string;
  name: string;
  cr: string | null;
  crNumeric?: string | null;
  type: string | null;
  size: string | null;
  known?: boolean;
}

export interface ConocidosPageItem {
  id: string;
  title: string | null;
  body: string;
  tags: string[];
  refs: BitacoraPageRef[];
}

interface ConocidosViewProps {
  characterId: string;
  monsters: KnownMonsterHit[];
  pages: ConocidosPageItem[];
}

export function ConocidosView({ characterId, monsters, pages }: ConocidosViewProps) {
  const [selectedMonster, setSelectedMonster] = useState<KnownMonsterHit | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [prefilledRef, setPrefilledRef] = useState<BitacoraPageRef | undefined>(undefined);

  // Build a quick lookup: which monster slugs have attached pages
  const monsterSlugsWithPages = new Set(
    pages.flatMap((p) =>
      p.refs
        .filter((r) => r.kind === 'monster')
        .map((r) => `${r.refKey}|${r.refSource}`),
    ),
  );

  // Get pages attached to a specific monster
  function getPagesForMonster(monster: KnownMonsterHit) {
    return pages.filter((p) =>
      p.refs.some(
        (r) =>
          r.kind === 'monster' &&
          r.refKey === monster.slug &&
          r.refSource === monster.source,
      ),
    );
  }

  function openComposerForMonster(monster: KnownMonsterHit) {
    setPrefilledRef({ kind: 'monster', refKey: monster.slug, refSource: monster.source });
    setComposerOpen(true);
  }

  // Monster detail view
  if (selectedMonster) {
    const monsterPages = getPagesForMonster(selectedMonster);

    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            setSelectedMonster(null);
            setComposerOpen(false);
          }}
          className="flex items-center gap-1 text-sm text-ink-mute hover:text-ink transition-colors min-h-[44px]"
        >
          <span aria-hidden="true">←</span>
          <span>Conocidos</span>
        </button>

        {/* Monster header */}
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <MonsterRowView row={{ ...selectedMonster, crNumeric: selectedMonster.crNumeric ?? null }} />
        </div>

        {/* Mis notas — REQ-BP-WEB-05 */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
            Mis notas
          </p>
          {monsterPages.length === 0 ? (
            <div className="py-6 text-center rounded-xl border border-dashed border-line bg-surface">
              <p className="text-sm text-ink-mute">No hay notas sobre este monstruo.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {monsterPages.map((page) => (
                <div
                  key={page.id}
                  className="rounded-xl border border-line bg-surface px-3 py-3 flex flex-col gap-1"
                >
                  {page.title && (
                    <p className="text-sm font-semibold text-ink">{page.title}</p>
                  )}
                  <p className="text-xs text-ink-mute line-clamp-3">{page.body}</p>
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
                </div>
              ))}
            </div>
          )}

          {/* Shortcut to create a page pre-populated with this monster ref */}
          <button
            type="button"
            onClick={() => openComposerForMonster(selectedMonster)}
            className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink hover:bg-paper transition-colors"
            aria-label={`Agregar nota sobre ${selectedMonster.name}`}
          >
            <span aria-hidden="true">＋</span>
            <span>Agregar nota</span>
          </button>
        </div>

        <BitacoraComposer
          characterId={characterId}
          knownMonsters={monsters.map((m) => ({ slug: m.slug, source: m.source, name: m.name }))}
          prefilledRef={prefilledRef}
          open={composerOpen}
          onClose={() => {
            setComposerOpen(false);
            setPrefilledRef(undefined);
          }}
        />
      </div>
    );
  }

  // Monster list
  if (monsters.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-ink-mute">
          Aún no conocés ningún monstruo.
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          El DM puede otorgarte conocimiento de un monstruo desde su panel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {monsters.map((monster) => {
        const hasNotes = monsterSlugsWithPages.has(`${monster.slug}|${monster.source}`);
        return (
          <button
            key={`${monster.slug}|${monster.source}`}
            type="button"
            onClick={() => setSelectedMonster(monster)}
            className="w-full text-left rounded-xl border border-line bg-surface px-3 hover:bg-paper transition-colors"
            aria-label={`Ver ${monster.name}${hasNotes ? ' (tiene notas)' : ''}`}
          >
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <MonsterRowView row={{ ...monster, crNumeric: monster.crNumeric ?? null }} />
              </div>
              {/* Note indicator dot — REQ-BP-WEB-02 */}
              {hasNotes && (
                <div
                  className="h-2 w-2 rounded-full bg-accent flex-shrink-0"
                  aria-hidden="true"
                  title="Tiene notas"
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
