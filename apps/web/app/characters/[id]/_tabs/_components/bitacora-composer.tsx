'use client';

/**
 * BitacoraComposer — bottom-sheet composer for creating and editing personal pages.
 *
 * Reuses V3Sheet bottom-sheet pattern (tap-outside-to-close, mobile-first 375px).
 * Fields: optional title, required body textarea, tag multi-select (KNOWLEDGE_TAGS pills),
 * optional ref picker with kind switch (Monstruo | NPC — uuid-bridge-npc B-3).
 *
 * NOTE: The ref picker sources from the player's KNOWN entities only (Conocidos
 * gate) — this is a UI discoverability decision. The API and domain do NOT restrict refs
 * to known entities; a page referencing an unknown entity is valid at the API layer.
 *
 * bitacora-personal SDD spec #1974 REQ-BP-WEB-04, design #1975 §ADR-5.
 * uuid-bridge-npc spec #2002 REQ-UBN-BITACORA, design #2003 ADR-5.
 * No PHB rule — anti-metagaming design principle.
 */

import { useState } from 'react';
import { KNOWLEDGE_TAGS } from '@dungeon-hub/domain/world/codex';
import { V3Sheet } from '@/components/ui';
import { createBitacoraPage, updateBitacoraPage } from '../../actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnownMonster {
  slug: string;
  source: string;
  name: string;
}

/**
 * Known NPC for the ref picker — projects to {id, name} only.
 * NO dmNotes — ADR-6 rule: web props for npcs carry ONLY safe fields.
 * uuid-bridge-npc B-3, REQ-UBN-BITACORA.
 */
export interface KnownNpc {
  id: string;    // UUID — used as refKey
  name: string;
}

/**
 * Known Faction for the ref picker — projects to {id, name, state} only.
 * NO dmNotes — ADR-6 rule: web props for factions carry ONLY safe fields.
 * uuid-bridge-factions-pois B-3, REQ-UBFP-BITACORA.
 */
export interface KnownFaction {
  id: string;    // UUID — used as refKey
  name: string;
  state: string; // FactionState — display only
}

/**
 * Known Location (POI) for the ref picker — projects to {id, name, status} only.
 * NO dmNotes, NO parentHexStatus — ADR-6 rule + C10: web props carry ONLY safe fields.
 * uuid-bridge-factions-pois B-3, REQ-UBFP-BITACORA.
 */
export interface KnownLocation {
  id: string;     // UUID — used as refKey
  name: string;
  status: string; // PoiStatus — display only
}

export interface BitacoraPageRef {
  kind: string;
  refKey: string;
  refSource: string;
}

export interface BitacoraPageData {
  id: string;
  title?: string | null;
  body: string;
  tags: string[];
  refs: BitacoraPageRef[];
}

/** Ref kind for the picker switch. uuid-bridge-factions-pois adds 'faction' + 'location'. */
type RefKindSwitch = 'monster' | 'npc' | 'faction' | 'location';

interface BitacoraComposerProps {
  characterId: string;
  knownMonsters: KnownMonster[];
  /** Known NPCs for the ref picker. uuid-bridge-npc B-3. NO dmNotes. */
  knownNpcs?: KnownNpc[];
  /** Known factions for the ref picker. uuid-bridge-factions-pois B-3. NO dmNotes. */
  knownFactions?: KnownFaction[];
  /** Known locations for the ref picker. uuid-bridge-factions-pois B-3. NO dmNotes/parentHexStatus. */
  knownLocations?: KnownLocation[];
  // When provided, composer opens in edit mode
  editPage?: BitacoraPageData;
  // Pre-populate with a ref (from Conocidos detail shortcut)
  prefilledRef?: { kind: string; refKey: string; refSource: string };
  onClose: () => void;
  open: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BitacoraComposer({
  characterId,
  knownMonsters,
  knownNpcs = [],
  knownFactions = [],
  knownLocations = [],
  editPage,
  prefilledRef,
  onClose,
  open,
}: BitacoraComposerProps) {
  const isEditMode = !!editPage;

  const [title, setTitle] = useState(editPage?.title ?? '');
  const [body, setBody] = useState(editPage?.body ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(editPage?.tags ?? []);
  const [selectedRef, setSelectedRef] = useState<BitacoraPageRef | null>(
    editPage?.refs[0] ?? prefilledRef ?? null,
  );

  // Kind switch: which entity type is the ref picker showing?
  // Derives from the prefilled/edit ref kind, defaulting to 'monster'.
  function resolveInitialKindSwitch(): RefKindSwitch {
    const kind = editPage?.refs[0]?.kind ?? prefilledRef?.kind;
    if (kind === 'npc') return 'npc';
    if (kind === 'faction') return 'faction';
    if (kind === 'location') return 'location';
    return 'monster';
  }
  const [refKindSwitch, setRefKindSwitch] = useState<RefKindSwitch>(resolveInitialKindSwitch());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleTagToggle(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  /** Monster ref picker handler (unchanged from original). */
  function handleMonsterRefChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (!val) {
      setSelectedRef(null);
      return;
    }
    const [refKey, refSource] = val.split('|');
    if (refKey && refSource) {
      setSelectedRef({ kind: 'monster', refKey, refSource });
    }
  }

  /**
   * NPC ref picker handler — uuid-bridge-npc B-3.
   * refSource='world' LOCKED for UUID kinds (ADR-2).
   */
  function handleNpcRefChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (!val) {
      setSelectedRef(null);
      return;
    }
    // NPC value encodes just the UUID; refSource is always 'world'
    setSelectedRef({ kind: 'npc', refKey: val, refSource: 'world' });
  }

  /**
   * Faction ref picker handler — uuid-bridge-factions-pois B-3.
   * refSource='world' LOCKED for UUID kinds (ADR-2).
   */
  function handleFactionRefChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (!val) {
      setSelectedRef(null);
      return;
    }
    setSelectedRef({ kind: 'faction', refKey: val, refSource: 'world' });
  }

  /**
   * Location ref picker handler — uuid-bridge-factions-pois B-3.
   * refSource='world' LOCKED for UUID kinds (ADR-2).
   */
  function handleLocationRefChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (!val) {
      setSelectedRef(null);
      return;
    }
    setSelectedRef({ kind: 'location', refKey: val, refSource: 'world' });
  }

  function handleKindSwitch(newKind: RefKindSwitch) {
    setRefKindSwitch(newKind);
    // Clear ref when switching kinds
    setSelectedRef(null);
  }

  function handleClose() {
    setError(null);
    setFieldErrors({});
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    const refs = selectedRef ? [selectedRef] : [];

    let result;
    if (isEditMode && editPage) {
      result = await updateBitacoraPage(characterId, editPage.id, {
        title: title.trim() || null,
        body: trimmedBody,
        tags: selectedTags,
        refs,
      });
    } else {
      result = await createBitacoraPage(characterId, {
        title: title.trim() || null,
        body: trimmedBody,
        tags: selectedTags,
        refs,
      });
    }

    setSubmitting(false);

    if (result.ok) {
      handleClose();
    } else {
      // Map domain issues to field errors
      const newFieldErrors: Record<string, string> = {};
      let generalError: string | null = null;

      if ('issues' in result && Array.isArray(result.issues)) {
        for (const issue of result.issues as Array<{ code: string; message: string; path?: string }>) {
          if (issue.path === 'body' || issue.code === 'BITACORA_PAGE_BODY_REQUIRED') {
            newFieldErrors['body'] = issue.message;
          } else if (issue.path === 'tags' || issue.code?.startsWith('BITACORA_PAGE_TAG')) {
            newFieldErrors['tags'] = issue.message;
          } else {
            generalError = issue.message;
          }
        }
      } else if ('error' in result) {
        generalError = (result as { error: string }).error;
      }

      setFieldErrors(newFieldErrors);
      setError(generalError);
    }
  }

  const hasMonsters = knownMonsters.length > 0;
  const hasNpcs = knownNpcs.length > 0;
  const hasFactions = knownFactions.length > 0;
  const hasLocations = knownLocations.length > 0;
  const hasAnyRef = hasMonsters || hasNpcs || hasFactions || hasLocations;

  const title_label = isEditMode ? 'Editar página' : 'Nueva página';
  const submitLabel = submitting ? 'Guardando…' : isEditMode ? 'Guardar cambios' : 'Crear página';

  return (
    <V3Sheet open={open} onClose={handleClose} title={title_label}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Title — optional */}
        <div>
          <label
            htmlFor="bp-title"
            className="block text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1"
          >
            Título{' '}
            <span className="text-ink-soft font-normal normal-case">(opcional)</span>
          </label>
          <input
            id="bp-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sin título"
            maxLength={120}
            className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
        </div>

        {/* Body — required */}
        <div>
          <label
            htmlFor="bp-body"
            className="block text-xs font-semibold uppercase tracking-wide text-ink-mute mb-1"
          >
            Notas
          </label>
          <textarea
            id="bp-body"
            data-autofocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribí tus notas…"
            rows={5}
            maxLength={10000}
            className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-ink/20"
          />
          {fieldErrors['body'] && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {fieldErrors['body']}
            </p>
          )}
        </div>

        {/* Tags */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
            Etiquetas
          </p>
          <div className="flex flex-wrap gap-2">
            {KNOWLEDGE_TAGS.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagToggle(tag)}
                  className={[
                    'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
                    active
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
                  ].join(' ')}
                  aria-pressed={active}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {fieldErrors['tags'] && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {fieldErrors['tags']}
            </p>
          )}
        </div>

        {/* Ref picker — kind switch (Monstruo | NPC | Facción | Lugar) + entity list.
            uuid-bridge-factions-pois B-3: extended from 2 to 4 kinds (ADR-5 delta).
            NOTE: API/domain accept refs to any known entity; UI restricts to known for UX.
            Pills may wrap to 2 rows at 375px — acceptable (ADR-5 mobile note). */}
        {hasAnyRef && (
          <div>
            <p className="block text-xs font-semibold uppercase tracking-wide text-ink-mute mb-2">
              Entidad relacionada{' '}
              <span className="text-ink-soft font-normal normal-case">(opcional)</span>
            </p>

            {/* Kind switch pills — show when multiple kinds are available */}
            {(hasMonsters || hasNpcs || hasFactions || hasLocations) && (
              <div className="flex flex-wrap gap-2 mb-2">
                {hasMonsters && (
                  <button
                    type="button"
                    onClick={() => handleKindSwitch('monster')}
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
                      refKindSwitch === 'monster'
                        ? 'bg-ink text-paper border-ink'
                        : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
                    ].join(' ')}
                    aria-pressed={refKindSwitch === 'monster'}
                  >
                    Monstruo
                  </button>
                )}
                {hasNpcs && (
                  <button
                    type="button"
                    onClick={() => handleKindSwitch('npc')}
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
                      refKindSwitch === 'npc'
                        ? 'bg-ink text-paper border-ink'
                        : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
                    ].join(' ')}
                    aria-pressed={refKindSwitch === 'npc'}
                  >
                    NPC
                  </button>
                )}
                {hasFactions && (
                  <button
                    type="button"
                    onClick={() => handleKindSwitch('faction')}
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
                      refKindSwitch === 'faction'
                        ? 'bg-ink text-paper border-ink'
                        : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
                    ].join(' ')}
                    aria-pressed={refKindSwitch === 'faction'}
                  >
                    Facción
                  </button>
                )}
                {hasLocations && (
                  <button
                    type="button"
                    onClick={() => handleKindSwitch('location')}
                    className={[
                      'rounded-full px-3 py-1 text-xs font-medium border transition-colors min-h-[32px]',
                      refKindSwitch === 'location'
                        ? 'bg-ink text-paper border-ink'
                        : 'bg-paper-soft text-ink-mute border-line hover:text-ink',
                    ].join(' ')}
                    aria-pressed={refKindSwitch === 'location'}
                  >
                    Lugar
                  </button>
                )}
              </div>
            )}

            {/* Monster ref picker */}
            {refKindSwitch === 'monster' && hasMonsters && (
              <select
                id="bp-ref"
                value={selectedRef?.kind === 'monster' ? `${selectedRef.refKey}|${selectedRef.refSource}` : ''}
                onChange={handleMonsterRefChange}
                className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="">Sin monstruo</option>
                {knownMonsters.map((m) => (
                  <option key={`${m.slug}|${m.source}`} value={`${m.slug}|${m.source}`}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}

            {/* NPC ref picker — uuid-bridge-npc B-3. refSource='world' LOCKED (ADR-2). */}
            {refKindSwitch === 'npc' && hasNpcs && (
              <select
                id="bp-ref-npc"
                value={selectedRef?.kind === 'npc' ? selectedRef.refKey : ''}
                onChange={handleNpcRefChange}
                className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="">Sin NPC</option>
                {knownNpcs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            )}

            {/* Faction ref picker — uuid-bridge-factions-pois B-3. refSource='world' LOCKED (ADR-2). */}
            {refKindSwitch === 'faction' && hasFactions && (
              <select
                id="bp-ref-faction"
                value={selectedRef?.kind === 'faction' ? selectedRef.refKey : ''}
                onChange={handleFactionRefChange}
                className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="">Sin facción</option>
                {knownFactions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}

            {/* Location ref picker — uuid-bridge-factions-pois B-3. refSource='world' LOCKED (ADR-2). */}
            {refKindSwitch === 'location' && hasLocations && (
              <select
                id="bp-ref-location"
                value={selectedRef?.kind === 'location' ? selectedRef.refKey : ''}
                onChange={handleLocationRefChange}
                className="w-full rounded-md border border-line bg-paper-soft px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
              >
                <option value="">Sin lugar</option>
                {knownLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 bg-paper py-2">
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="min-h-[44px] w-full rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </V3Sheet>
  );
}
