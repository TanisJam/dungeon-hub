'use client';

/**
 * MonsterGrantPicker — DM monster typeahead that feeds candidateEntities.
 *
 * codex-knowledge B-3 gap closure (next-steps #1953):
 *   The complete form's KnowledgeGrantSection renders chips from candidateEntities,
 *   but Slice 1 had no way to populate them (candidateEntities=[] hardcoded), so the
 *   hybrid unlock's session-complete path was dead in the UI. This picker lets the DM
 *   search the world's compendium monsters and add them as bestiary candidates.
 *   ADR-2 (#1946): monsters only in Slice 1.
 *
 * NOTE: session_events/npc_met auto-population is DEFERRED to Layer 2 (#1946).
 * This is the manual "DM explicit grant" half of the hybrid (FORK 1, #1944).
 *
 * Mobile-first: full-width search + tappable result rows (min-h-[44px]).
 * Renders inline inside the CompleteForm V3Sheet (no nested modal).
 *
 * Design intent: FORK 1 (#1944). This arc encodes NO PHB rule.
 */

import { useEffect, useRef, useState } from 'react';
import {
  searchSessionMonsters,
  type MonsterHit,
} from '@/app/campanas/[id]/sessions/actions';
import type { CandidateEntity } from './knowledge-grant-section';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MonsterGrantPickerProps {
  /** Campaign scope — required by GET /compendium/monsters (XOR campaign/world). */
  campaignId: string;
  /**
   * Keys already added as candidates (`${kind}|${refKey}|${refSource}`).
   * Used to skip re-adding a monster that's already a chip.
   */
  existingKeys: Set<string>;
  /** Called when the DM picks a monster — appends it to candidateEntities. */
  onAdd: (entity: CandidateEntity) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonsterGrantPicker({
  campaignId,
  existingKeys,
  onAdd,
}: MonsterGrantPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MonsterHit[]>([]);
  const [searching, setSearching] = useState(false);
  const reqIdRef = useRef(0);

  // Debounced search — re-issue 200ms after the last keystroke; drop stale responses.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const myReqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      const hits = await searchSessionMonsters(campaignId, trimmed);
      if (reqIdRef.current === myReqId) {
        setResults(hits);
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, campaignId]);

  function handlePick(monster: MonsterHit) {
    const key = `bestiary|${monster.slug}|${monster.source}`;
    if (!existingKeys.has(key)) {
      onAdd({
        kind: 'bestiary',
        refKey: monster.slug,
        refSource: monster.source,
        label: monster.name,
      });
    }
    setQuery('');
    setResults([]);
  }

  const trimmed = query.trim();

  return (
    <div>
      <label
        htmlFor="monster-grant-search"
        className="block font-sans text-xs text-ink-mute"
      >
        Buscar monstruo
      </label>
      <input
        id="monster-grant-search"
        type="search"
        inputMode="search"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ej. goblin"
        className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-paper-soft px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-mute focus:border-ink focus:outline-none"
      />

      {trimmed.length > 0 && searching && (
        <p className="mt-2 font-sans text-xs text-ink-mute">Buscando…</p>
      )}
      {trimmed.length > 0 && !searching && results.length === 0 && (
        <p className="mt-2 font-sans text-xs text-ink-mute">Sin resultados.</p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-line rounded-md border border-line">
          {results.map((monster) => (
            <li key={`${monster.slug}|${monster.source}`}>
              <button
                type="button"
                onClick={() => handlePick(monster)}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2 text-left font-sans text-sm text-ink transition-colors hover:bg-paper active:bg-surface-raised"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{monster.name}</span>
                <span className="flex-shrink-0 text-[10px] uppercase tracking-wide text-ink-mute">
                  {monster.source}
                  {monster.cr ? ` · CR ${monster.cr}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
