'use client';

/**
 * ConocidosView — client component for the Conocidos sub-view.
 *
 * Shows stacked per-kind sections: Monsters (existing, verbatim) + NPCs (new, uuid-bridge-npc B-3).
 *
 * Monsters section: unchanged from original — known monster list with statblock detail,
 *   note indicator dots, "Mis notas" list, composer shortcut.
 * NPCs section: known NPC list (sanitized CodexNpcRow — NO dmNotes), inline NPC detail card,
 *   note indicator dots, attached pages, composer shortcut.
 *
 * Mobile: single vertical scroll, stacked sections, ≥44px tap targets. No tabs/pills for kind.
 *
 * bitacora-personal SDD spec #1974 REQ-BP-WEB-02 / REQ-BP-WEB-05, design #1975 §ADR-4.
 * uuid-bridge-npc spec #2002 REQ-UBN-CONOCIDOS, design #2003 ADR-4.
 * No PHB rule — anti-metagaming design principle.
 */

import { useState } from 'react';
import { MonsterRowView } from '@/app/compendium/[category]/_components/row-views';
import { DetailSheet } from '@/app/compendium/[category]/_components/detail-sheet';
import { CATEGORY_CONFIG } from '@/app/compendium/[category]/_config/registry';
import { BitacoraComposer, type BitacoraPageRef } from './bitacora-composer';
import type { CodexNpcRowSSR } from '../notas';

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

const NPC_STATUS_LABELS: Record<CodexNpcRowSSR['status'], string> = {
  alive: 'Vivo',
  dead: 'Muerto',
  missing: 'Desaparecido',
  unknown: 'Desconocido',
};

interface ConocidosViewProps {
  characterId: string;
  monsters: KnownMonsterHit[];
  /** Known NPCs from GET /knowledge/npcs — CodexNpcRow (NO dmNotes, ADR-6). uuid-bridge-npc B-3. */
  npcs: CodexNpcRowSSR[];
  pages: ConocidosPageItem[];
  worldId: string;
  accessToken: string;
}

export function ConocidosView({ characterId, monsters, npcs, pages, worldId, accessToken }: ConocidosViewProps) {
  const [selectedMonster, setSelectedMonster] = useState<KnownMonsterHit | null>(null);
  const [selectedNpc, setSelectedNpc] = useState<CodexNpcRowSSR | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [prefilledRef, setPrefilledRef] = useState<BitacoraPageRef | undefined>(undefined);
  const [statblockOpen, setStatblockOpen] = useState(false);

  // Build a quick lookup: which monster slugs have attached pages
  const monsterSlugsWithPages = new Set(
    pages.flatMap((p) =>
      p.refs
        .filter((r) => r.kind === 'monster')
        .map((r) => `${r.refKey}|${r.refSource}`),
    ),
  );

  // Build a quick lookup: which NPC IDs have attached pages (uuid-bridge-npc ADR-4)
  const npcIdsWithPages = new Set(
    pages.flatMap((p) =>
      p.refs
        .filter((r) => r.kind === 'npc')
        .map((r) => r.refKey),
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

  // Get pages attached to a specific NPC (uuid-bridge-npc ADR-4)
  function getPagesForNpc(npc: CodexNpcRowSSR) {
    return pages.filter((p) =>
      p.refs.some(
        (r) =>
          r.kind === 'npc' &&
          r.refKey === npc.id &&
          r.refSource === 'world',
      ),
    );
  }

  function openComposerForMonster(monster: KnownMonsterHit) {
    setPrefilledRef({ kind: 'monster', refKey: monster.slug, refSource: monster.source });
    setComposerOpen(true);
  }

  function openComposerForNpc(npc: CodexNpcRowSSR) {
    setPrefilledRef({ kind: 'npc', refKey: npc.id, refSource: 'world' });
    setComposerOpen(true);
  }

  // ── Monster detail view ───────────────────────────────────────────────────

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

        {/* Monster header — tap to open the full statblock (REQ: "más detalles") */}
        <button
          type="button"
          onClick={() => setStatblockOpen(true)}
          className="w-full text-left rounded-xl border border-line bg-surface px-4 py-3 hover:bg-paper transition-colors"
          aria-label={`Ver ficha completa de ${selectedMonster.name}`}
        >
          <MonsterRowView row={{ ...selectedMonster, crNumeric: selectedMonster.crNumeric ?? null }} />
          <span className="mt-1 block text-xs font-medium text-accent">Ver ficha completa →</span>
        </button>

        {/* Full statblock — reuses the compendium DetailSheet (fetches GET /compendium/monsters/:slug). */}
        <DetailSheet
          open={statblockOpen}
          category="monsters"
          row={selectedMonster}
          scope={{ world: worldId }}
          worldId={worldId}
          accessToken={accessToken}
          config={CATEGORY_CONFIG.monsters}
          onClose={() => setStatblockOpen(false)}
        />

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
          knownNpcs={npcs.map((n) => ({ id: n.id, name: n.name }))}
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

  // ── NPC detail view (uuid-bridge-npc ADR-4, ADR-6) ───────────────────────

  if (selectedNpc) {
    const npcPages = getPagesForNpc(selectedNpc);

    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            setSelectedNpc(null);
            setComposerOpen(false);
          }}
          className="flex items-center gap-1 text-sm text-ink-mute hover:text-ink transition-colors min-h-[44px]"
        >
          <span aria-hidden="true">←</span>
          <span>Conocidos</span>
        </button>

        {/* NPC inline detail card — sanitized (NO dmNotes, ADR-6 D3) */}
        <div className="rounded-xl border border-line bg-surface px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h3 className="flex-1 font-semibold text-base text-ink">{selectedNpc.name}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full border border-line bg-paper-soft text-ink-mute">
              {NPC_STATUS_LABELS[selectedNpc.status]}
            </span>
          </div>
          {selectedNpc.race && (
            <p className="text-xs text-ink-mute">
              <span className="font-semibold uppercase tracking-wide">Raza:</span>{' '}
              {selectedNpc.race}
            </p>
          )}
          {selectedNpc.description && (
            <p className="text-sm text-ink whitespace-pre-wrap">{selectedNpc.description}</p>
          )}
          {/* dmNotes intentionally absent — CodexNpcRow has no dmNotes field (ADR-6) */}
        </div>

        {/* Mis notas sobre este NPC */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
            Mis notas
          </p>
          {npcPages.length === 0 ? (
            <div className="py-6 text-center rounded-xl border border-dashed border-line bg-surface">
              <p className="text-sm text-ink-mute">No hay notas sobre este NPC.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {npcPages.map((page) => (
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

          <button
            type="button"
            onClick={() => openComposerForNpc(selectedNpc)}
            className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-line bg-paper-soft px-4 py-2 text-sm font-medium text-ink hover:bg-paper transition-colors"
            aria-label={`Agregar nota sobre ${selectedNpc.name}`}
          >
            <span aria-hidden="true">＋</span>
            <span>Agregar nota</span>
          </button>
        </div>

        <BitacoraComposer
          characterId={characterId}
          knownMonsters={monsters.map((m) => ({ slug: m.slug, source: m.source, name: m.name }))}
          knownNpcs={npcs.map((n) => ({ id: n.id, name: n.name }))}
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

  // ── Stacked list: Monsters + NPCs ─────────────────────────────────────────

  const hasMonsters = monsters.length > 0;
  const hasNpcs = npcs.length > 0;

  if (!hasMonsters && !hasNpcs) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-ink-mute">
          Aún no conocés ningún monstruo ni NPC.
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          El DM puede otorgarte conocimiento desde su panel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Monsters section (verbatim from original — NO regression allowed) ── */}
      {hasMonsters && (
        <section aria-label="Monstruos conocidos">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
            Monstruos
          </p>
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
        </section>
      )}

      {/* ── NPCs section (uuid-bridge-npc B-3, REQ-UBN-CONOCIDOS, ADR-4) ── */}
      {hasNpcs && (
        <section aria-label="NPCs conocidos">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
            NPCs
          </p>
          <div className="flex flex-col gap-2">
            {npcs.map((npc) => {
              const hasNotes = npcIdsWithPages.has(npc.id);
              return (
                <button
                  key={npc.id}
                  type="button"
                  onClick={() => setSelectedNpc(npc)}
                  className="w-full text-left rounded-xl border border-line bg-surface px-3 py-3 min-h-[44px] hover:bg-paper transition-colors"
                  aria-label={`Ver ${npc.name}${hasNotes ? ' (tiene notas)' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{npc.name}</p>
                      {npc.race && (
                        <p className="text-xs text-ink-mute">{npc.race}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-line bg-paper-soft text-ink-mute">
                      {NPC_STATUS_LABELS[npc.status]}
                    </span>
                    {/* Note indicator dot */}
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
        </section>
      )}

      {/* Shared composer — rendered at list level (not inside sections) */}
      <BitacoraComposer
        characterId={characterId}
        knownMonsters={monsters.map((m) => ({ slug: m.slug, source: m.source, name: m.name }))}
        knownNpcs={npcs.map((n) => ({ id: n.id, name: n.name }))}
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
