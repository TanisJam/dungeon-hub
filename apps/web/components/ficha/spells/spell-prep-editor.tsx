'use client';

import { useState, useTransition } from 'react';
import { filterPrepUniverse } from './spell-prep-helpers';
import { saveSpellPrepForClass } from './save-spell-prep-action';

/** Minimal spell reference (slug + source). */
export interface SpellRef {
  slug: string;
  source: string;
}

/** Shape returned by GET /characters/:id/classes/:slug/spells/options */
interface AvailableSpell {
  slug: string;
  source: string;
  name: string;
  level: number;
  ritual: boolean;
  concentration: boolean;
  componentsM: boolean;
  componentsMCost: number | null;
}

interface SpellPrepEditorProps {
  characterId: string;
  classSlug: string;
  classSource: string;
  /** Full leveled+cantrip list from /options — cantrips filtered here. */
  availableSpells: AvailableSpell[];
  /** Slugs that are always prepared (subclass domain spells). */
  subclassGrantedSlugs: string[];
  /** Optional — only Wizard/EK/AT. Filters universe to spellbook. */
  knownUniverseSlugs?: ReadonlySet<string>;
  /** Currently prepared spells from the sheet. */
  initialPrepared: SpellRef[];
  /** Max prepared spells for this class. */
  prepLimit: number;
  /** Preserved in the PUT payload; not modified by this editor. */
  existingCantrips: SpellRef[];
  /** Preserved in the PUT payload; not modified by this editor. */
  existingKnown: SpellRef[];
  onClose: () => void;
}

/**
 * SpellPrepEditor — form body for toggling prepared spells per class.
 * SPELL-PREP-02 through SPELL-PREP-08.
 * Permission-aware: always editable (SPELL-PREP-08 — no status lock).
 */
export function SpellPrepEditor({
  characterId,
  classSlug,
  classSource,
  availableSpells,
  subclassGrantedSlugs,
  knownUniverseSlugs,
  initialPrepared,
  prepLimit,
  existingCantrips,
  existingKnown,
  onClose,
}: SpellPrepEditorProps) {
  // Filter: leveled only, optionally intersect with spellbook
  const prepUniverse = filterPrepUniverse(availableSpells, knownUniverseSlugs);

  // Subclass-granted set (for O(1) lookups)
  const grantedSet = new Set(subclassGrantedSlugs);

  // Non-granted prep universe
  const selectableSpells = prepUniverse.filter((s) => !grantedSet.has(s.slug));

  // Local prepared state — initialized from props, clamped defensive read
  const initialSlugs = new Set(initialPrepared.map((s) => s.slug));
  const [preparedSlugs, setPreparedSlugs] = useState<Set<string>>(
    () => new Set([...initialSlugs].filter((slug) => !grantedSet.has(slug))),
  );

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const count = preparedSlugs.size;
  const atLimit = count >= prepLimit;
  const overLimit = count > prepLimit;

  const counterTone = overLimit ? 'danger' : atLimit ? 'amber' : 'green';
  const counterColors: Record<string, string> = {
    green: 'text-green-700 bg-green-50 border-green-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    danger: 'text-red-700 bg-red-50 border-red-200',
  };

  function handleToggle(slug: string, source: string) {
    setPreparedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else if (!atLimit || prev.has(slug)) {
        next.add(slug);
      }
      return next;
    });
  }

  function handleSave() {
    setError(null);
    // Build prepared array from state — exclude subclass grants
    const prepared: SpellRef[] = selectableSpells
      .filter((s) => preparedSlugs.has(s.slug))
      .map((s) => ({ slug: s.slug, source: s.source }));

    startTransition(async () => {
      const result = await saveSpellPrepForClass({
        characterId,
        classSlug,
        cantrips: existingCantrips,
        known: existingKnown,
        prepared,
      });
      if (result.ok) {
        onClose();
      } else {
        if (result.error === 'over_limit') {
          setError('Superaste el límite de hechizos preparados.');
        } else if (result.error === 'auth') {
          setError('No autenticado. Recargá la página.');
        } else {
          setError(result.message ?? 'Error al guardar. Intentá de nuevo.');
        }
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Counter pill */}
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${counterColors[counterTone]}`}>
        <span>{count}/{prepLimit} preparados</span>
      </div>

      {/* At/over-limit hint */}
      {atLimit && !overLimit && (
        <p className="text-xs text-amber-600">Límite alcanzado</p>
      )}

      {/* Error banner */}
      {error && (
        <div role="alert" className="rounded-md border border-line bg-surface-soft px-3 py-2 text-sm text-ink-soft">
          {error}
        </div>
      )}

      {/* Subclass-granted rows — always prepared, not toggleable */}
      {subclassGrantedSlugs.length > 0 && (
        <div className="space-y-1">
          {subclassGrantedSlugs.map((slug) => {
            const spell = availableSpells.find((s) => s.slug === slug) as AvailableSpell | undefined;
            if (!spell) return null;
            return (
              <div key={slug} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={String(spell.name)}
                  readOnly
                />
                <span className="text-sm text-ink">{String(spell.name)}</span>
                <span className="ml-auto text-xs text-ink-mute">Siempre preparado</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Selectable spell rows */}
      {selectableSpells.length === 0 ? (
        <p className="text-sm text-ink-mute">Aprendé hechizos al subir de nivel</p>
      ) : (
        <div className="space-y-1 divide-y divide-line">
          {selectableSpells.map((spell) => {
            const checked = preparedSlugs.has(spell.slug);
            const disabledByLimit = atLimit && !checked;
            return (
              <div key={`${spell.slug}|${spell.source}`} className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabledByLimit}
                  aria-label={spell.name}
                  onChange={() => handleToggle(spell.slug, spell.source)}
                />
                <span className={`text-sm ${disabledByLimit ? 'text-ink-mute' : 'text-ink'}`}>
                  {spell.name}
                </span>
                <span className="ml-auto text-xs text-ink-mute">Nv {spell.level}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Save button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
